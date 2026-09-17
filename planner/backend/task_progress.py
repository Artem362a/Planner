"""Shared day-task progress rules for the REST API and Telegram bot.

These helpers mutate the caller's transaction; committing remains its responsibility.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, cast

from sqlalchemy.orm import Session

from db import DayTask, InboxTask, Reminder, WeekTask
from schedule_sync import lock_day_plan


def sync_task_reminder(db: Session, user_id: int, task: Any) -> None:
    """Приводит Reminder(kind='task') в соответствие задаче дня.

    Якорь времени — start_time (режим «Начало–Конец», авто-следует за
    переносом задачи) либо, если его нет, remind_anchor_time (режим
    «Длительность»: снимок computed_start_time с фронта на момент включения,
    не пересчитывается сам при изменении соседних задач).
    Напоминание живёт, пока есть remind_lead_min и якорь, задача не выполнена
    и время напоминания ещё впереди; иначе удаляется.
    Задачу нужно flush'нуть до вызова (нужен task.id).
    """
    rem = db.query(Reminder).filter(Reminder.source_task_id == task.id).first()

    lead = getattr(task, "remind_lead_min", None)
    anchor = task.start_time or getattr(task, "remind_anchor_time", None)
    anchor_day_offset = (
        int(getattr(task, "start_day_offset", 0) or 0)
        if task.start_time is not None
        else int(getattr(task, "remind_anchor_day_offset", 0) or 0)
    )
    remind_at = None
    if lead is not None and anchor is not None and task.status == 0:
        remind_at = datetime.combine(
            task.day + timedelta(days=anchor_day_offset), anchor
        ) - timedelta(minutes=lead)

    if remind_at is None or remind_at <= datetime.now():
        if rem is not None:
            db.delete(rem)
        return

    if anchor_day_offset == 1:
        day_suffix = " (+1 день)"
    elif anchor_day_offset:
        day_suffix = f" (+{anchor_day_offset} дня)"
    else:
        day_suffix = ""
    text = f"Задача «{task.title}» в {anchor.strftime('%H:%M')}{day_suffix}"
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


def sync_task_progress(
    db: Session, user_id: int, task: Any, old_status: int, *, subtasks_changed: bool = False
) -> None:
    """Keep week instances and the inbox in sync after a day-task edit."""
    d = task.day
    # Синхронизация в недельную задачу, если дневная была импортирована из недели.
    # Recurring-задачи (повтор по дням недели) — исключение: там каждый день
    # независимое повторение, а не растянутый на несколько дней один инстанс.
    # Кросс-дневное зеркалирование подзадач, синк статуса недельной задачи и
    # каскад на соседние дни для них не применяются (day_task.status уже
    # выставлен независимо выше). Авто-выполнение дня по своим же подзадачам —
    # чисто локальная логика, которая применяется в обоих случаях.
    if task.source_week_task_id is not None:
        week_task = (
            db.query(WeekTask)
            .filter(
                WeekTask.id == task.source_week_task_id,
                WeekTask.user_id == user_id,
            )
            .first()
        )

        if week_task is not None:
            week_task_row = cast(Any, week_task)
            is_recurring = week_task_row.task_type == "recurring"

            if subtasks_changed:
                synced_subtasks = list(task.subtasks or [])

                if not is_recurring:
                    # Прокидываем подзадачи как есть
                    week_task_row.subtasks = synced_subtasks

                    # Подзадачи общие для всех инстансов недельной задачи: их состояние
                    # пропихиваем в pending sibling-дни, чтобы юзер видел одно и то же
                    # на каждый день. Completed дни — это исторический снапшот, их не трогаем.
                    db.query(DayTask).filter(
                        DayTask.user_id == user_id,
                        DayTask.source_week_task_id == task.source_week_task_id,
                        DayTask.id != task.id,
                        DayTask.status == 0,
                    ).update({"subtasks": synced_subtasks}, synchronize_session=False)

                # Авто-выполнение только когда все подзадачи отмечены
                if len(synced_subtasks) > 0 and all(bool(s.get("done")) for s in synced_subtasks):
                    task.status = 1

            if not is_recurring:
                # Синхронизируем статус недельной задачи по итоговому статусу дневной
                week_task_row.status = task.status

                # Каскад смены статуса: удаление/восстановление дневных задач в других днях
                if old_status != task.status:
                    if task.status == 1:
                        # Помечаем прошлые незавершённые дни как выполненные
                        db.query(DayTask).filter(
                            DayTask.user_id == user_id,
                            DayTask.source_week_task_id == task.source_week_task_id,
                            DayTask.day < d,
                            DayTask.status == 0,
                        ).update({"status": 1}, synchronize_session=False)
                        # Удаляем будущие незавершённые дни
                        db.query(DayTask).filter(
                            DayTask.user_id == user_id,
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
                                    DayTask.user_id == user_id,
                                    DayTask.day == restore_day,
                                    DayTask.source_week_task_id == task.source_week_task_id,
                                )
                                .first()
                            )
                            if exists is None:
                                max_ord = (
                                    db.query(DayTask.order_index)
                                    .filter(DayTask.user_id == user_id, DayTask.day == restore_day)
                                    .order_by(DayTask.order_index.desc())
                                    .first()
                                )
                                db.add(DayTask(
                                    user_id=user_id,
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
            inbox_row = db.query(InboxTask).filter(InboxTask.id == source_inbox_id, InboxTask.user_id == user_id).first()
            if inbox_row is not None:
                cast(Any, inbox_row).completed_at = datetime.utcnow()



def set_task_status(db: Session, user_id: int, task: Any, status: int) -> None:
    """Complete or reopen a task with the same cascade as an edit in the day plan.

    Reminder acknowledgements retain their delivery record, so callers manage
    the source reminder's lifecycle after updating task progress.
    """
    old_status = task.status
    task.status = status
    lock_day_plan(db, user_id, task.day)
    sync_task_progress(db, user_id, task, old_status)
