from __future__ import annotations

from datetime import date, datetime, timedelta
from datetime import time as _time
from typing import Any, List, cast

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import create_access_token, hash_password, verify_password
from bootstrap import DOCS_DIR, ensure_default_categories_for_user
from db import (
    DaySettings,
    DayTask,
    DayTemplate,
    FeedbackMessage,
    Goal,
    GoalCheckin,
    GoalStage,
    InboxTask,
    Notification,
    NotificationRecipient,
    Reminder,
    TaskCategory,
    User,
    WeekTask,
    WeekTemplate,
)
from dependencies import get_current_developer, get_current_user, get_db
from schemas import *
from serializers import *

router = APIRouter()


def _sync_task_reminder(db: Session, user_id: int, task: Any) -> None:
    """Приводит Reminder(kind='task') в соответствие задаче дня.

    Напоминание живёт, пока у задачи есть remind_lead_min и start_time,
    она не выполнена и время напоминания ещё впереди; иначе удаляется.
    Задачу нужно flush'нуть до вызова (нужен task.id).
    """
    rem = db.query(Reminder).filter(Reminder.source_task_id == task.id).first()

    lead = getattr(task, "remind_lead_min", None)
    remind_at = None
    if lead is not None and task.start_time is not None and task.status == 0:
        remind_at = datetime.combine(task.day, task.start_time) - timedelta(minutes=lead)

    if remind_at is None or remind_at <= datetime.now():
        if rem is not None:
            db.delete(rem)
        return

    text = f"Задача «{task.title}» в {task.start_time.strftime('%H:%M')}"
    if rem is None:
        db.add(
            Reminder(
                user_id=user_id,
                text=text,
                remind_at=remind_at,
                kind="task",
                source_task_id=task.id,
            )
        )
        return

    rem_row = cast(Any, rem)
    if rem_row.remind_at != remind_at or rem_row.text != text:
        rem_row.text = text
        rem_row.remind_at = remind_at
        rem_row.sent = False
        rem_row.sent_at = None
        rem_row.ack = None
        rem_row.ack_at = None
        rem_row.repeat_count = 0

@router.get("/day/{day}", response_model=List[TaskOut])
def get_day(
    day: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date format, use YYYY-MM-DD")

    tasks = (
        db.query(DayTask)
        .filter(
            DayTask.user_id == current_user_row.id,
            DayTask.day == d,
        )
        .order_by(DayTask.order_index, DayTask.id)
        .all()
    )

    return [_task_to_out(cast(DayTaskRow, t)) for t in tasks]


@router.get("/day/{day}/settings")
def get_day_settings(
    day: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date format, use YYYY-MM-DD")

    settings = (
        db.query(DaySettings)
        .filter(
            DaySettings.user_id == current_user_row.id,
            DaySettings.day == d,
        )
        .first()
    )

    if settings is None:
        today = date.today()
        if d > today:
            user_default = getattr(current_user_row, "default_day_start_time", None)
            default_str = user_default.strftime("%H:%M") if user_default else "06:00"
        else:
            default_str = "06:00"
        return {"day": d, "start_time": default_str}

    settings_row = cast(DaySettingsRow, settings)
    return {
        "day": settings_row.day,
        "start_time": settings_row.start_time.strftime("%H:%M"),
    }


@router.put("/day/{day}/settings")
def save_day_settings(
    day: str,
    body: DaySettingsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date format, use YYYY-MM-DD")

    try:
        parts = body.start_time.split(":")
        hh, mm = int(parts[0]), int(parts[1])
        parsed_time = _time(hour=hh, minute=mm)
    except Exception:
        raise HTTPException(400, "Bad time format, use HH:MM")

    settings = (
        db.query(DaySettings)
        .filter(
            DaySettings.user_id == current_user_row.id,
            DaySettings.day == d,
        )
        .first()
    )

    if settings is None:
        new_settings = DaySettings(
            user_id=current_user_row.id,
            day=d,
            start_time=parsed_time,
        )
        db.add(new_settings)
    else:
        settings_row = cast(DaySettingsRow, settings)
        settings_row.start_time = parsed_time

    db.commit()
    return {"ok": True, "start_time": body.start_time}


@router.post("/day/{day}/tasks", response_model=TaskOut)
def create_task(
    day: str,
    body: TaskIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date format, use YYYY-MM-DD")

    start_time = None
    if body.start_time:
        parts = body.start_time.split(":")
        hh, mm = int(parts[0]), int(parts[1])
        start_time = _time(hour=hh, minute=mm)

    subtasks_payload = [s.dict() for s in body.subtasks] if body.subtasks else []
    insert_before_id = body.insert_before_id
    new_order_index = 0

    if insert_before_id is None:
        max_order = (
            db.query(DayTask.order_index)
            .filter(
                DayTask.user_id == current_user_row.id,
                DayTask.day == d,
            )
            .order_by(DayTask.order_index.desc())
            .first()
        )
        new_order_index = (max_order[0] + 1) if max_order else 0
    else:
        before_task = (
            db.query(DayTask)
            .filter(
                DayTask.id == insert_before_id,
                DayTask.day == d,
                DayTask.user_id == current_user_row.id,
            )
            .first()
        )

        if before_task is None:
            raise HTTPException(404, "Insert target task not found")

        before_task_row = cast(DayTaskRow, before_task)
        new_order_index = before_task_row.order_index

        tasks_to_shift = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == current_user_row.id,
                DayTask.day == d,
                DayTask.order_index >= new_order_index,
            )
            .all()
        )

        for existing_task in tasks_to_shift:
            existing_task_row = cast(DayTaskRow, existing_task)
            existing_task_row.order_index += 1

    task = DayTask(
        user_id=current_user_row.id,
        day=d,
        title=body.title,
        start_time=start_time,
        duration_min=body.duration_min,
        priority=body.priority,
        category=body.category,
        status=body.status,
        subtasks=subtasks_payload,
        order_index=new_order_index,
        remind_lead_min=(
            body.remind_lead_min
            if body.remind_lead_min is not None and body.remind_lead_min >= 0
            else None
        ),
    )

    db.add(task)
    db.flush()
    _sync_task_reminder(db, current_user_row.id, cast(Any, task))
    db.commit()
    db.refresh(task)

    return _task_to_out(cast(DayTaskRow, task))


@router.patch("/day/{day}/tasks/{task_id}", response_model=TaskOut)
def update_task(
    day: str,
    task_id: int,
    body: TaskIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date format, use YYYY-MM-DD")

    db_task = (
        db.query(DayTask)
        .filter(
            DayTask.id == task_id,
            DayTask.day == d,
            DayTask.user_id == current_user_row.id,
        )
        .first()
    )

    if db_task is None:
        raise HTTPException(404, "Task not found")

    task = cast(DayTaskRow, db_task)
    old_status = task.status

    if body.title is not None:
        task.title = body.title
    if body.priority is not None:
        task.priority = body.priority
    if body.duration_min is not None:
        task.duration_min = body.duration_min
    if body.start_time is not None:
        if body.start_time == "":
            task.start_time = None
        else:
            parts = body.start_time.split(":")
            hh, mm = int(parts[0]), int(parts[1])
            task.start_time = _time(hour=hh, minute=mm)
    if body.category is not None:
        task.category = body.category
    if body.status is not None:
        task.status = body.status
    if body.subtasks is not None:
        task.subtasks = [s.dict() for s in body.subtasks]
    if body.source_week_task_id is not None:
        task.source_week_task_id = body.source_week_task_id
    if body.remind_lead_min is not None:
        # Отрицательное значение = снять напоминание (None в PATCH значит «не менять»).
        task.remind_lead_min = body.remind_lead_min if body.remind_lead_min >= 0 else None

    # Синхронизация в недельную задачу, если дневная была импортирована из недели
    if task.source_week_task_id is not None:
        week_task = (
            db.query(WeekTask)
            .filter(
                WeekTask.id == task.source_week_task_id,
                WeekTask.user_id == current_user_row.id,
            )
            .first()
        )

        if week_task is not None:
            week_task_row = cast(Any, week_task)

            # Прокидываем подзадачи как есть
            if body.subtasks is not None:
                synced_subtasks = [s.dict() for s in body.subtasks]
                week_task_row.subtasks = synced_subtasks

                # Подзадачи общие для всех инстансов недельной задачи: их состояние
                # пропихиваем в pending sibling-дни, чтобы юзер видел одно и то же
                # на каждый день. Completed дни — это исторический снапшот, их не трогаем.
                db.query(DayTask).filter(
                    DayTask.user_id == current_user_row.id,
                    DayTask.source_week_task_id == task.source_week_task_id,
                    DayTask.id != task.id,
                    DayTask.status == 0,
                ).update({"subtasks": synced_subtasks}, synchronize_session=False)

                # Авто-выполнение только когда все подзадачи отмечены
                if len(synced_subtasks) > 0 and all(bool(s.get("done")) for s in synced_subtasks):
                    task.status = 1

            # Синхронизируем статус недельной задачи по итоговому статусу дневной
            week_task_row.status = task.status

            # Каскад смены статуса: удаление/восстановление дневных задач в других днях
            if old_status != task.status:
                if task.status == 1:
                    # Помечаем прошлые незавершённые дни как выполненные
                    db.query(DayTask).filter(
                        DayTask.user_id == current_user_row.id,
                        DayTask.source_week_task_id == task.source_week_task_id,
                        DayTask.day < d,
                        DayTask.status == 0,
                    ).update({"status": 1}, synchronize_session=False)
                    # Удаляем будущие незавершённые дни
                    db.query(DayTask).filter(
                        DayTask.user_id == current_user_row.id,
                        DayTask.source_week_task_id == task.source_week_task_id,
                        DayTask.day > d,
                        DayTask.status == 0,
                    ).delete(synchronize_session=False)
                elif task.status == 0:
                    restore_day = d + timedelta(days=1)
                    raw_rd = cast(list[Any] | None, getattr(week_task_row, "repeat_days", None)) or []
                    restore_repeat_days: set[int] = set()
                    for rd in raw_rd:
                        try:
                            restore_repeat_days.add(int(rd))
                        except (TypeError, ValueError):
                            pass
                    while restore_day <= week_task_row.end_date:
                        if restore_repeat_days and restore_day.weekday() not in restore_repeat_days:
                            restore_day += timedelta(days=1)
                            continue
                        exists = (
                            db.query(DayTask)
                            .filter(
                                DayTask.user_id == current_user_row.id,
                                DayTask.day == restore_day,
                                DayTask.source_week_task_id == task.source_week_task_id,
                            )
                            .first()
                        )
                        if exists is None:
                            max_ord = (
                                db.query(DayTask.order_index)
                                .filter(DayTask.user_id == current_user_row.id, DayTask.day == restore_day)
                                .order_by(DayTask.order_index.desc())
                                .first()
                            )
                            db.add(DayTask(
                                user_id=current_user_row.id,
                                day=restore_day,
                                title=week_task_row.name,
                                duration_min=None,
                                priority="high" if getattr(week_task_row, "important", False) else "medium",
                                category=week_task_row.category,
                                status=0,
                                subtasks=list(week_task_row.subtasks) if week_task_row.subtasks else [],
                                source_week_task_id=task.source_week_task_id,
                                order_index=(max_ord[0] + 1) if max_ord else 0,
                            ))
                        restore_day += timedelta(days=1)

    # Если задача из Inbox и только что выполнена — фиксируем completed_at
    if old_status != task.status and task.status == 1:
        source_inbox_id = getattr(task, "source_inbox_task_id", None)
        if source_inbox_id:
            inbox_row = db.query(InboxTask).filter(InboxTask.id == source_inbox_id).first()
            if inbox_row is not None:
                cast(Any, inbox_row).completed_at = datetime.utcnow()

    _sync_task_reminder(db, current_user_row.id, cast(Any, task))
    db.commit()
    db.refresh(db_task)

    return _task_to_out(cast(DayTaskRow, db_task))


@router.post("/day/{day}/reorder")
def reorder_day_tasks(
    day: str,
    body: DayTaskReorderIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date format, use YYYY-MM-DD")

    db_rows = (
        db.query(DayTask)
        .filter(
            DayTask.user_id == current_user_row.id,
            DayTask.day == d,
            DayTask.id.in_(body.ordered_ids),
        )
        .all()
    )

    if len(db_rows) != len(body.ordered_ids):
        raise HTTPException(404, "Some tasks not found")

    rows = [cast(DayTaskRow, row) for row in db_rows]
    task_map: dict[int, DayTaskRow] = {task.id: task for task in rows}

    for index, task_id in enumerate(body.ordered_ids):
        task_map[task_id].order_index = index

    db.commit()
    return {"ok": True}


@router.delete("/day/{day}/tasks/{task_id}")
def delete_task(
    day: str,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date format, use YYYY-MM-DD")

    task = (
        db.query(DayTask)
        .filter(
            DayTask.id == task_id,
            DayTask.day == d,
            DayTask.user_id == current_user_row.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(404, "Task not found")

    db.delete(task)
    db.commit()
    return {"ok": True}


@router.get("/day-tasks/overdue", response_model=list[OverdueTaskOut])
def get_overdue_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    current_user_row = cast(Any, current_user)

    # Загружаем цвета категорий пользователя один раз
    cat_rows = db.query(TaskCategory).filter(TaskCategory.user_id == current_user_row.id).all()
    cat_color_map: dict[str, str] = {}
    for c in cat_rows:
        cr = cast(Any, c)
        cat_color_map[cr.key] = cr.color
        cat_color_map[cr.title] = cr.color  # fallback по title

    pending_past = (
        db.query(DayTask)
        .filter(
            DayTask.user_id == current_user_row.id,
            DayTask.day < today,
            DayTask.status == 0,
            DayTask.dismissed.isnot(True),
        )
        .order_by(DayTask.day.asc(), DayTask.order_index.asc())
        .all()
    )

    result = []
    seen_week_task_ids: set[int] = set()

    for task in pending_past:
        t = cast(Any, task)
        cat_color = cat_color_map.get(t.category) if t.category else None

        if t.source_week_task_id is not None:
            if t.source_week_task_id in seen_week_task_ids:
                continue

            week_task = (
                db.query(WeekTask)
                .filter(
                    WeekTask.id == t.source_week_task_id,
                    WeekTask.user_id == current_user_row.id,
                )
                .first()
            )
            if week_task is None:
                continue

            wt = cast(Any, week_task)
            if wt.end_date >= today:
                continue

            seen_week_task_ids.add(t.source_week_task_id)
            result.append(OverdueTaskOut(
                id=t.id,
                title=t.title,
                category=t.category,
                category_color=cat_color,
                priority=t.priority,
                day=t.day,
                source_week_task_id=t.source_week_task_id,
                week_start_date=wt.start_date,
                week_end_date=wt.end_date,
                subtasks=t.subtasks or [],
            ))
        else:
            result.append(OverdueTaskOut(
                id=t.id,
                title=t.title,
                category=t.category,
                category_color=cat_color,
                priority=t.priority,
                day=t.day,
                subtasks=t.subtasks or [],
            ))

    return result


@router.delete("/day-tasks/{task_id}/dismiss")
def dismiss_overdue_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    current_user_row = cast(Any, current_user)

    task = (
        db.query(DayTask)
        .filter(
            DayTask.id == task_id,
            DayTask.user_id == current_user_row.id,
        )
        .first()
    )
    if task is None:
        raise HTTPException(404, "Task not found")

    t = cast(Any, task)

    if t.source_week_task_id is not None:
        db.query(DayTask).filter(
            DayTask.user_id == current_user_row.id,
            DayTask.source_week_task_id == t.source_week_task_id,
            DayTask.day < today,
            DayTask.status == 0,
        ).update({"dismissed": True}, synchronize_session=False)
    else:
        t.dismissed = True

    db.commit()
    return {"ok": True}


@router.post("/day-tasks/{task_id}/reschedule", response_model=TaskOut)
def reschedule_task(
    task_id: int,
    body: RescheduleIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    current_user_row = cast(Any, current_user)

    if body.new_date < today:
        raise HTTPException(400, "Новая дата не может быть в прошлом")

    task = (
        db.query(DayTask)
        .filter(
            DayTask.id == task_id,
            DayTask.user_id == current_user_row.id,
        )
        .first()
    )
    if task is None:
        raise HTTPException(404, "Task not found")

    t = cast(Any, task)

    if t.source_week_task_id is not None:
        db.query(DayTask).filter(
            DayTask.user_id == current_user_row.id,
            DayTask.source_week_task_id == t.source_week_task_id,
            DayTask.day < today,
            DayTask.status == 0,
        ).delete(synchronize_session=False)
    else:
        db.delete(task)

    max_order = (
        db.query(DayTask.order_index)
        .filter(DayTask.user_id == current_user_row.id, DayTask.day == body.new_date)
        .order_by(DayTask.order_index.desc())
        .first()
    )

    new_task = DayTask(
        user_id=current_user_row.id,
        day=body.new_date,
        title=t.title,
        duration_min=t.duration_min,
        start_time=t.start_time,
        priority=t.priority,
        category=t.category,
        status=0,
        subtasks=list(t.subtasks) if t.subtasks else [],
        order_index=(max_order[0] + 1) if max_order else 0,
        # Сохраняем связь с источником при переносе: иначе выполнение
        # перенесённой задачи не отметило бы исходное входящее/недельную задачу.
        source_inbox_task_id=getattr(t, "source_inbox_task_id", None),
        source_week_task_id=t.source_week_task_id,
        remind_lead_min=getattr(t, "remind_lead_min", None),
    )

    db.add(new_task)
    db.flush()
    _sync_task_reminder(db, current_user_row.id, cast(Any, new_task))
    db.commit()
    db.refresh(new_task)

    return _task_to_out(cast(DayTaskRow, new_task))


@router.get("/week-import-candidates/{day}", response_model=list[WeekImportCandidateOut])
def get_week_import_candidates(
    day: str,
    days_ahead: int = 2,
    days_back: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        base_day = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date format, use YYYY-MM-DD")

    days_ahead = max(0, min(days_ahead, 7))
    days_back = max(0, min(days_back, 30))

    upcoming_days = []
    for offset in range(0, days_ahead + 1):
        upcoming_days.append(base_day + timedelta(days=offset))

    overdue_window_start = base_day - timedelta(days=days_back)

    week_rows = (
        db.query(WeekTask)
        .filter(
            WeekTask.user_id == current_user_row.id,
            WeekTask.status != 1,
        )
        .order_by(
            WeekTask.important.desc(),
            WeekTask.order_index.asc(),
            WeekTask.id.asc(),
        )
        .all()
    )

    upcoming_candidates: list[WeekImportCandidateOut] = []
    overdue_candidates: list[WeekImportCandidateOut] = []

    seen_upcoming_keys: set[tuple[Any, ...]] = set()
    seen_overdue_keys: set[tuple[Any, ...]] = set()

    for target_day in upcoming_days:
        existing_rows = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == current_user_row.id,
                DayTask.day == target_day,
            )
            .all()
        )

        existing_pairs = {
            (
                cast(DayTaskRow, row).title.strip().lower(),
                cast(DayTaskRow, row).category,
            )
            for row in existing_rows
        }

        for raw_row in week_rows:
            row = cast(WeekTaskRow, raw_row)

            if not _is_week_task_available_on_day(row, target_day):
                continue

            normalized_title = row.name.strip().lower()
            pair = (normalized_title, row.category)

            if pair in existing_pairs:
                continue

            if (row.task_type or "").strip() == "recurring":
                dedupe_key = (
                    normalized_title,
                    row.category,
                    target_day.isoformat(),
                    "recurring",
                )
            else:
                dedupe_key = (
                    normalized_title,
                    row.category,
                    row.start_date.isoformat(),
                    row.end_date.isoformat(),
                    "range",
                )

            if dedupe_key in seen_upcoming_keys:
                continue

            seen_upcoming_keys.add(dedupe_key)
            upcoming_candidates.append(
                _week_task_to_import_candidate(
                    row,
                    target_day,
                    is_overdue=False,
                )
            )

    # Невыполненные: не recurring, уже закончились, но закончились не раньше чем 7 дней назад
    existing_today_rows = (
        db.query(DayTask)
        .filter(
            DayTask.user_id == current_user_row.id,
            DayTask.day == base_day,
        )
        .all()
    )

    existing_today_pairs = {
        (
            cast(DayTaskRow, row).title.strip().lower(),
            cast(DayTaskRow, row).category,
        )
        for row in existing_today_rows
    }

    for raw_row in week_rows:
        row = cast(WeekTaskRow, raw_row)

        if (row.task_type or "").strip() == "recurring":
            continue

        if row.end_date >= base_day:
            continue

        if row.end_date < overdue_window_start:
            continue

        normalized_title = row.name.strip().lower()
        pair = (normalized_title, row.category)

        if pair in existing_today_pairs:
            continue

        dedupe_key = (
            normalized_title,
            row.category,
            row.start_date.isoformat(),
            row.end_date.isoformat(),
            "overdue",
        )

        if dedupe_key in seen_overdue_keys:
            continue

        seen_overdue_keys.add(dedupe_key)
        overdue_candidates.append(
            _week_task_to_import_candidate(
                row,
                base_day,
                is_overdue=True,
            )
        )

    return upcoming_candidates + overdue_candidates

@router.post("/day/import-week-tasks", response_model=list[TaskOut])
def import_week_tasks_to_days(
    body: ImportWeekTasksIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    created_tasks: list[DayTask] = []
    target_day = body.target_day

    max_order_row = (
        db.query(DayTask.order_index)
        .filter(
            DayTask.user_id == current_user_row.id,
            DayTask.day == target_day,
        )
        .order_by(DayTask.order_index.desc())
        .first()
    )
    next_order = (max_order_row[0] + 1) if max_order_row else 0

    for item in body.items:
        week_task = (
            db.query(WeekTask)
            .filter(
                WeekTask.id == item.week_task_id,
                WeekTask.user_id == current_user_row.id,
                WeekTask.status != 1,
            )
            .first()
        )
        if week_task is None:
            continue

        row = cast(WeekTaskRow, week_task)

        if not item.is_overdue:
            if not _is_week_task_available_on_day(row, item.import_day):
                continue

        duplicate = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == current_user_row.id,
                DayTask.day == target_day,
                DayTask.title == row.name,
                DayTask.category == row.category,
            )
            .first()
        )
        if duplicate is not None:
            continue

        new_task = DayTask(
            user_id=current_user_row.id,
            day=target_day,
            title=row.name,
            start_time=None,
            duration_min=None,
            priority="high" if row.important else "medium",
            category=row.category,
            status=0,
            subtasks=cast(list[dict[str, Any]] | None, row.subtasks) or [],
            order_index=next_order,
            source_week_task_id=row.id,
        )

        db.add(new_task)
        created_tasks.append(new_task)
        next_order += 1

    db.commit()

    for task in created_tasks:
        db.refresh(task)

    return [_task_to_out(cast(DayTaskRow, task)) for task in created_tasks]
