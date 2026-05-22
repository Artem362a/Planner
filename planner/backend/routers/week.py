from __future__ import annotations

from datetime import date, datetime, timedelta
from datetime import time as _time
from typing import Any, List, cast

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, or_
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
    Notification,
    NotificationRecipient,
    TaskCategory,
    User,
    WeekTask,
    WeekTemplate,
)
from dependencies import get_current_developer, get_current_user, get_db
from schemas import *
from serializers import *

router = APIRouter()


def _get_next_day_order(db: Session, user_id: int, d: date) -> int:
    max_order = (
        db.query(DayTask.order_index)
        .filter(DayTask.user_id == user_id, DayTask.day == d)
        .order_by(DayTask.order_index.desc())
        .first()
    )
    return (max_order[0] + 1) if max_order else 0


def _sync_day_tasks_for_week_task(db: Session, week_task: Any, user_id: int) -> None:
    """Создаёт DayTask для каждого дня диапазона, если их ещё нет."""
    raw_repeat_days = getattr(week_task, "repeat_days", None) or []
    repeat_days_set: set[int] = set()
    for rd in raw_repeat_days:
        try:
            repeat_days_set.add(int(rd))
        except (TypeError, ValueError):
            pass

    d = week_task.start_date
    while d <= week_task.end_date:
        if repeat_days_set and d.weekday() not in repeat_days_set:
            d += timedelta(days=1)
            continue

        existing = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user_id,
                DayTask.day == d,
                DayTask.source_week_task_id == week_task.id,
            )
            .first()
        )
        if existing is None:
            db.add(DayTask(
                user_id=user_id,
                day=d,
                title=week_task.name,
                duration_min=None,
                priority="high" if getattr(week_task, "important", False) else "medium",
                category=week_task.category,
                status=0,
                subtasks=list(week_task.subtasks) if week_task.subtasks else [],
                source_week_task_id=week_task.id,
                order_index=_get_next_day_order(db, user_id, d),
            ))
        d += timedelta(days=1)

@router.get("/week-tasks", response_model=list[WeekTaskOut])
def api_list_week_tasks(
    week_start: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    week_end = week_start + timedelta(days=6)

    rows = (
        db.query(WeekTask)
        .filter(
            WeekTask.user_id == current_user_row.id,
            or_(
                # Обычные задачи: start_date в текущей неделе
                (WeekTask.start_date >= week_start) & (WeekTask.start_date <= week_end),
                # Recurring задачи: диапазон перекрывается с текущей неделей
                (WeekTask.task_type == "recurring")
                & (WeekTask.start_date <= week_end)
                & (WeekTask.end_date >= week_start),
            ),
        )
        .order_by(
            WeekTask.important.desc(),
            WeekTask.order_index.asc(),
            WeekTask.id.asc(),
        )
        .all()
    )

    # Для recurring задач: создаём DayTask'и на текущей неделе если их ещё нет
    any_created = False
    for row in rows:
        row_cast = cast(Any, row)
        if (row_cast.task_type or "").strip() == "recurring" and row_cast.status != 1:
            week_range_start = max(row_cast.start_date, week_start)
            week_range_end = min(row_cast.end_date, week_end)
            raw_repeat = row_cast.repeat_days or []
            repeat_set: set[int] = set()
            for rd in raw_repeat:
                try:
                    repeat_set.add(int(rd))
                except (TypeError, ValueError):
                    pass
            d = week_range_start
            while d <= week_range_end:
                if repeat_set and d.weekday() not in repeat_set:
                    d += timedelta(days=1)
                    continue
                exists = (
                    db.query(DayTask)
                    .filter(
                        DayTask.user_id == current_user_row.id,
                        DayTask.day == d,
                        DayTask.source_week_task_id == row_cast.id,
                    )
                    .first()
                )
                if exists is None:
                    max_ord = (
                        db.query(DayTask.order_index)
                        .filter(DayTask.user_id == current_user_row.id, DayTask.day == d)
                        .order_by(DayTask.order_index.desc())
                        .first()
                    )
                    db.add(DayTask(
                        user_id=current_user_row.id,
                        day=d,
                        title=row_cast.name,
                        duration_min=None,
                        priority="high" if row_cast.important else "medium",
                        category=row_cast.category,
                        status=0,
                        subtasks=list(row_cast.subtasks) if row_cast.subtasks else [],
                        source_week_task_id=row_cast.id,
                        order_index=(max_ord[0] + 1) if max_ord else 0,
                    ))
                    any_created = True
                d += timedelta(days=1)
    if any_created:
        db.commit()

    return [_week_task_model_to_out(row) for row in rows]


@router.get("/week-tasks/important", response_model=list[WeekTaskOut])
def api_list_important_week_tasks(
    week_start: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    week_end = week_start + timedelta(days=6)

    rows = (
        db.query(WeekTask)
        .filter(
            WeekTask.user_id == current_user_row.id,
            WeekTask.important == True,  # noqa: E712
            WeekTask.status != 1,
            or_(
                (WeekTask.start_date >= week_start) & (WeekTask.start_date <= week_end),
                (WeekTask.task_type == "recurring")
                & (WeekTask.start_date <= week_end)
                & (WeekTask.end_date >= week_start),
            ),
        )
        .order_by(
            WeekTask.order_index.asc(),
            WeekTask.id.asc(),
        )
        .all()
    )

    return [_week_task_model_to_out(row) for row in rows]


@router.post("/week-tasks/reorder")
def api_reorder_week_tasks(
    body: WeekTaskReorderIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    db_rows = (
        db.query(WeekTask)
        .filter(
            WeekTask.user_id == current_user_row.id,
            WeekTask.id.in_(body.ordered_ids),
        )
        .all()
    )

    if len(db_rows) != len(body.ordered_ids):
        raise HTTPException(404, "Some week tasks not found")

    row_map = {cast(Any, row).id: cast(Any, row) for row in db_rows}
    for index, task_id in enumerate(body.ordered_ids):
        row_map[task_id].order_index = index

    db.commit()
    return {"ok": True}


@router.post("/week-tasks", response_model=WeekTaskOut)
def api_create_week_task(
    body: WeekTaskIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    max_order = (
        db.query(func.max(WeekTask.order_index))
        .filter(WeekTask.user_id == current_user_row.id)
        .scalar()
    )
    next_order = (max_order if max_order is not None else -1) + 1

    db_row = WeekTask(
        user_id=current_user_row.id,
        name=body.name,
        start_date=body.start_date,
        end_date=body.end_date,
        category=body.category,
        important=body.important,
        status=body.status,
        task_type=body.task_type,
        repeat_days=body.repeat_days,
        volume_value=body.volume_value,
        subtasks=[s.dict() for s in body.subtasks],
        order_index=next_order,
    )

    db.add(db_row)
    db.commit()
    db.refresh(db_row)

    _sync_day_tasks_for_week_task(db, cast(Any, db_row), current_user_row.id)
    db.commit()

    return _week_task_model_to_out(db_row)


@router.patch("/week-tasks/{task_id}", response_model=WeekTaskOut)
def api_update_week_task(
    task_id: int,
    body: WeekTaskIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    db_row = (
        db.query(WeekTask)
        .filter(
            WeekTask.id == task_id,
            WeekTask.user_id == current_user_row.id,
        )
        .first()
    )
    if db_row is None:
        raise HTTPException(404, "Week task not found")

    row = cast(Any, db_row)

    row.name = body.name
    row.start_date = body.start_date
    row.end_date = body.end_date
    row.category = body.category
    row.important = body.important
    row.status = body.status
    row.task_type = body.task_type
    row.repeat_days = body.repeat_days
    row.volume_value = body.volume_value
    row.subtasks = [s.dict() for s in body.subtasks]

    db.commit()
    db.refresh(db_row)

    # Обновляем название и категорию в уже существующих незавершённых дневных задачах
    db.query(DayTask).filter(
        DayTask.user_id == current_user_row.id,
        DayTask.source_week_task_id == task_id,
        DayTask.status == 0,
        DayTask.day >= body.start_date,
        DayTask.day <= body.end_date,
    ).update({"title": body.name, "category": body.category}, synchronize_session=False)

    # Удаляем незавершённые дневные задачи вне нового диапазона
    db.query(DayTask).filter(
        DayTask.user_id == current_user_row.id,
        DayTask.source_week_task_id == task_id,
        DayTask.status == 0,
        or_(DayTask.day < body.start_date, DayTask.day > body.end_date),
    ).delete(synchronize_session=False)

    # Для recurring: удаляем дни внутри диапазона, которые не входят в новый repeat_days
    new_repeat_days_set: set[int] = set()
    for rd in (body.repeat_days or []):
        try:
            new_repeat_days_set.add(int(rd))
        except (TypeError, ValueError):
            pass
    if new_repeat_days_set:
        in_range_tasks = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == current_user_row.id,
                DayTask.source_week_task_id == task_id,
                DayTask.status == 0,
                DayTask.day >= body.start_date,
                DayTask.day <= body.end_date,
            )
            .all()
        )
        for dt in in_range_tasks:
            if cast(Any, dt).day.weekday() not in new_repeat_days_set:
                db.delete(dt)

    # Создаём дневные задачи для новых дней диапазона
    _sync_day_tasks_for_week_task(db, cast(Any, db_row), current_user_row.id)
    db.commit()

    return _week_task_model_to_out(db_row)


@router.delete("/week-tasks/{task_id}")
def api_delete_week_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    row = (
        db.query(WeekTask)
        .filter(
            WeekTask.id == task_id,
            WeekTask.user_id == current_user_row.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(404, "Week task not found")

    # Удаляем незавершённые дневные задачи, связанные с этой недельной
    db.query(DayTask).filter(
        DayTask.user_id == current_user_row.id,
        DayTask.source_week_task_id == task_id,
        DayTask.status == 0,
    ).delete(synchronize_session=False)

    # У завершённых дневных задач обнуляем FK, чтобы они пережили удаление недельной
    db.query(DayTask).filter(
        DayTask.user_id == current_user_row.id,
        DayTask.source_week_task_id == task_id,
    ).update({"source_week_task_id": None}, synchronize_session=False)

    db.delete(row)
    db.commit()
    return {"ok": True}
