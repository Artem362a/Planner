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
            WeekTask.start_date >= week_start,
            WeekTask.start_date <= week_end,
        )
        .order_by(
            WeekTask.important.desc(),
            WeekTask.order_index.asc(),
            WeekTask.id.asc(),
        )
        .all()
    )

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
            WeekTask.start_date >= week_start,
            WeekTask.start_date <= week_end,
            WeekTask.status != 1,
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

    db.delete(row)
    db.commit()
    return {"ok": True}
