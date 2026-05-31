from __future__ import annotations

from datetime import date, datetime, timedelta
from datetime import time as _time
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import DayTask, InboxTask, WeekTask
from dependencies import get_current_user, get_db
from schemas import (
    InboxAssignDayIn,
    InboxAssignWeekIn,
    InboxTaskIn,
    InboxTaskOut,
    InboxTaskUpdateIn,
    SubTask,
    TaskOut,
    WeekTaskOut,
)
from serializers import _task_to_out, _week_task_model_to_out

router = APIRouter()


def _inbox_to_out(row: Any) -> InboxTaskOut:
    subtasks_raw = row.subtasks or []
    assigned_at = getattr(row, "assigned_at", None)
    completed_at = getattr(row, "completed_at", None)
    return InboxTaskOut(
        id=row.id,
        title=row.title,
        description=row.description,
        priority=row.priority or "medium",
        category=row.category,
        subtasks=[SubTask(**s) if isinstance(s, dict) else s for s in subtasks_raw],
        created_at=row.created_at.isoformat() + "Z",
        assigned_at=(assigned_at.isoformat() + "Z") if assigned_at else None,
        completed_at=(completed_at.isoformat() + "Z") if completed_at else None,
    )


def _get_next_day_order(db: Session, user_id: int, day: date) -> int:
    row = (
        db.query(DayTask.order_index)
        .filter(DayTask.user_id == user_id, DayTask.day == day)
        .order_by(DayTask.order_index.desc())
        .first()
    )
    return (row[0] + 1) if row else 0


@router.get("/inbox", response_model=list[InboxTaskOut])
def list_inbox(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = cast(Any, current_user)
    rows = (
        db.query(InboxTask)
        .filter(InboxTask.user_id == user.id)
        .order_by(InboxTask.created_at.desc())
        .all()
    )
    return [_inbox_to_out(cast(Any, r)) for r in rows]


@router.post("/inbox", response_model=InboxTaskOut)
def create_inbox_task(
    body: InboxTaskIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = cast(Any, current_user)
    task = InboxTask(
        user_id=user.id,
        title=body.title.strip(),
        description=body.description.strip() if body.description else None,
        priority=body.priority,
        category=body.category,
        subtasks=[s.dict() for s in body.subtasks] if body.subtasks else [],
        created_at=datetime.utcnow(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _inbox_to_out(cast(Any, task))


@router.patch("/inbox/{task_id}", response_model=InboxTaskOut)
def update_inbox_task(
    task_id: int,
    body: InboxTaskUpdateIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = cast(Any, current_user)
    row = (
        db.query(InboxTask)
        .filter(InboxTask.id == task_id, InboxTask.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Inbox task not found")

    t = cast(Any, row)
    if body.title is not None:
        t.title = body.title.strip()
    if body.description is not None:
        t.description = body.description.strip() or None
    if body.priority is not None:
        t.priority = body.priority
    if body.category is not None:
        t.category = body.category or None
    if body.subtasks is not None:
        t.subtasks = [s.dict() for s in body.subtasks]

    db.commit()
    db.refresh(row)
    return _inbox_to_out(cast(Any, row))


@router.delete("/inbox/{task_id}")
def delete_inbox_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = cast(Any, current_user)
    row = (
        db.query(InboxTask)
        .filter(InboxTask.id == task_id, InboxTask.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Inbox task not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/inbox/{task_id}/assign-day", response_model=TaskOut)
def assign_inbox_to_day(
    task_id: int,
    body: InboxAssignDayIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = cast(Any, current_user)
    inbox_row = (
        db.query(InboxTask)
        .filter(InboxTask.id == task_id, InboxTask.user_id == user.id)
        .first()
    )
    if inbox_row is None:
        raise HTTPException(404, "Inbox task not found")

    t = cast(Any, inbox_row)
    new_task = DayTask(
        user_id=user.id,
        day=body.day,
        title=t.title,
        start_time=None,
        duration_min=None,
        priority=t.priority or "medium",
        category=t.category,
        status=0,
        subtasks=list(t.subtasks) if t.subtasks else [],
        order_index=_get_next_day_order(db, user.id, body.day),
        source_inbox_task_id=t.id,
    )
    db.add(new_task)
    t.assigned_at = datetime.utcnow()
    db.commit()
    db.refresh(new_task)

    from schemas import DayTaskRow
    return _task_to_out(cast(DayTaskRow, new_task))


@router.post("/inbox/{task_id}/assign-week", response_model=WeekTaskOut)
def assign_inbox_to_week(
    task_id: int,
    body: InboxAssignWeekIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user = cast(Any, current_user)
    inbox_row = (
        db.query(InboxTask)
        .filter(InboxTask.id == task_id, InboxTask.user_id == user.id)
        .first()
    )
    if inbox_row is None:
        raise HTTPException(404, "Inbox task not found")

    t = cast(Any, inbox_row)

    # Normalize to Monday of the given week
    week_start = body.week_start - timedelta(days=body.week_start.weekday())
    week_end = week_start + timedelta(days=6)

    max_order = (
        db.query(WeekTask.order_index)
        .filter(
            WeekTask.user_id == user.id,
            WeekTask.start_date >= week_start,
            WeekTask.start_date <= week_end,
        )
        .order_by(WeekTask.order_index.desc())
        .first()
    )

    new_week_task = WeekTask(
        user_id=user.id,
        name=t.title,
        start_date=week_start,
        end_date=week_end,
        category=t.category,
        important=(t.priority == "high"),
        status=0,
        task_type="normal",
        repeat_days=[],
        volume_value=None,
        subtasks=list(t.subtasks) if t.subtasks else [],
        order_index=(max_order[0] + 1) if max_order else 0,
    )
    db.add(new_week_task)
    db.flush()

    # Auto-create DayTasks for each day in the week
    nwt = cast(Any, new_week_task)
    d = week_start
    while d <= week_end:
        db.add(DayTask(
            user_id=user.id,
            day=d,
            title=nwt.name,
            duration_min=None,
            priority="high" if nwt.important else "medium",
            category=nwt.category,
            status=0,
            subtasks=list(nwt.subtasks) if nwt.subtasks else [],
            source_week_task_id=nwt.id,
            source_inbox_task_id=t.id,
            order_index=_get_next_day_order(db, user.id, d),
        ))
        d += timedelta(days=1)

    t.assigned_at = datetime.utcnow()
    db.commit()
    db.refresh(new_week_task)

    return _week_task_model_to_out(cast(Any, new_week_task))
