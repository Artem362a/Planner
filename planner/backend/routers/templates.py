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

@router.get("/day-templates", response_model=list[DayTemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    templates = (
        db.query(DayTemplate)
        .filter(DayTemplate.user_id == current_user_row.id)
        .order_by(DayTemplate.id)
        .all()
    )
    return [_template_to_out(cast(DayTemplateRow, t)) for t in templates]


@router.post("/day-templates", response_model=DayTemplateOut)
def create_template(
    body: DayTemplateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    tmpl = DayTemplate(
        user_id=current_user_row.id,
        name=body.name,
        color=body.color,
        tasks_json=[task.dict() for task in body.tasks],
        day_start=body.day_start,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return _template_to_out(cast(DayTemplateRow, tmpl))


@router.patch("/day-templates/{template_id}", response_model=DayTemplateOut)
def patch_template(
    template_id: int,
    body: DayTemplatePatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    tmpl = (
        db.query(DayTemplate)
        .filter(
            DayTemplate.id == template_id,
            DayTemplate.user_id == current_user_row.id,
        )
        .first()
    )
    if not tmpl:
        raise HTTPException(404, "Template not found")

    if body.name is not None:
        tmpl.name = body.name
    if body.color is not None:
        tmpl.color = body.color
    if body.tasks is not None:
        tmpl.tasks_json = [task.dict() for task in body.tasks]
    if body.day_start is not None:
        # Пустая строка очищает значение.
        tmpl.day_start = body.day_start or None

    db.commit()
    db.refresh(tmpl)
    return _template_to_out(cast(DayTemplateRow, tmpl))


@router.delete("/day-templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    tmpl = (
        db.query(DayTemplate)
        .filter(
            DayTemplate.id == template_id,
            DayTemplate.user_id == current_user_row.id,
        )
        .first()
    )
    if not tmpl:
        raise HTTPException(404, "Template not found")

    db.delete(tmpl)
    db.commit()
    return {"ok": True}


@router.post("/day-templates/{template_id}/apply/{day}", response_model=list[TaskOut])
def apply_template(
    template_id: int,
    day: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Bad date format, use YYYY-MM-DD")

    tmpl = (
        db.query(DayTemplate)
        .filter(
            DayTemplate.id == template_id,
            DayTemplate.user_id == current_user_row.id,
        )
        .first()
    )
    if not tmpl:
        raise HTTPException(404, "Template not found")

    existing_total = (
        db.query(func.coalesce(func.sum(DayTask.duration_min), 0))
        .filter(DayTask.user_id == current_user_row.id, DayTask.day == d)
        .scalar()
    ) or 0

    template_tasks = cast(list[dict[str, Any]], tmpl.tasks_json or [])
    template_total = sum(int(t.get("duration_min") or 0) for t in template_tasks)

    if existing_total + template_total > 1440:
        raise HTTPException(400, "День не может превышать 24 часа.")

    created_tasks: list[DayTask] = []

    max_order = (
        db.query(DayTask.order_index)
        .filter(
            DayTask.user_id == current_user_row.id,
            DayTask.day == d,
        )
        .order_by(DayTask.order_index.desc())
        .first()
    )
    next_order = (max_order[0] + 1) if max_order else 0

    template_tasks = cast(list[dict[str, Any]], tmpl.tasks_json or [])

    for idx, t in enumerate(template_tasks):
        start_time = None
        if t.get("start_time"):
            parts = t["start_time"].split(":")
            start_time = _time(hour=int(parts[0]), minute=int(parts[1]))

        task = DayTask(
            user_id=current_user_row.id,
            day=d,
            title=t["title"],
            start_time=start_time,
            duration_min=t.get("duration_min"),
            priority=t.get("priority", "medium"),
            category=t.get("category"),
            status=0,
            subtasks=t.get("subtasks") or [],
            order_index=next_order + idx,
        )
        db.add(task)
        created_tasks.append(task)

    # Если в шаблоне задано начало дня — применяем его к настройкам этого дня.
    tmpl_day_start = getattr(tmpl, "day_start", None)
    if tmpl_day_start:
        try:
            parts = str(tmpl_day_start).split(":")
            parsed_start = _time(hour=int(parts[0]), minute=int(parts[1]))
        except (ValueError, IndexError):
            parsed_start = None
        if parsed_start is not None:
            settings = (
                db.query(DaySettings)
                .filter(
                    DaySettings.user_id == current_user_row.id,
                    DaySettings.day == d,
                )
                .first()
            )
            if settings is None:
                db.add(DaySettings(
                    user_id=current_user_row.id,
                    day=d,
                    start_time=parsed_start,
                ))
            else:
                cast(Any, settings).start_time = parsed_start

    db.commit()
    for task in created_tasks:
        db.refresh(task)

    return [_task_to_out(cast(DayTaskRow, task)) for task in created_tasks]


@router.get("/week-templates", response_model=list[WeekTemplateOut])
def list_week_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    templates = (
        db.query(WeekTemplate)
        .filter(WeekTemplate.user_id == current_user_row.id)
        .order_by(WeekTemplate.id)
        .all()
    )
    return [_week_template_to_out(cast(WeekTemplateRow, t)) for t in templates]


@router.post("/week-templates", response_model=WeekTemplateOut)
def create_week_template(
    body: WeekTemplateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    tmpl = WeekTemplate(
        user_id=current_user_row.id,
        name=body.name,
        color=body.color,
        tasks_json=[task.dict() for task in body.tasks],
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return _week_template_to_out(cast(WeekTemplateRow, tmpl))


@router.patch("/week-templates/{template_id}", response_model=WeekTemplateOut)
def patch_week_template(
    template_id: int,
    body: WeekTemplatePatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    tmpl = (
        db.query(WeekTemplate)
        .filter(
            WeekTemplate.id == template_id,
            WeekTemplate.user_id == current_user_row.id,
        )
        .first()
    )
    if not tmpl:
        raise HTTPException(404, "Week template not found")

    if body.name is not None:
        tmpl.name = body.name
    if body.color is not None:
        tmpl.color = body.color
    if body.tasks is not None:
        tmpl.tasks_json = [task.dict() for task in body.tasks]

    db.commit()
    db.refresh(tmpl)
    return _week_template_to_out(cast(WeekTemplateRow, tmpl))


@router.delete("/week-templates/{template_id}")
def delete_week_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    tmpl = (
        db.query(WeekTemplate)
        .filter(
            WeekTemplate.id == template_id,
            WeekTemplate.user_id == current_user_row.id,
        )
        .first()
    )
    if not tmpl:
        raise HTTPException(404, "Week template not found")

    db.delete(tmpl)
    db.commit()
    return {"ok": True}


@router.post("/week-templates/{template_id}/apply", response_model=list[WeekTaskOut])
def apply_week_template(
    template_id: int,
    body: WeekTemplateApplyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    tmpl = (
        db.query(WeekTemplate)
        .filter(
            WeekTemplate.id == template_id,
            WeekTemplate.user_id == current_user_row.id,
        )
        .first()
    )
    if not tmpl:
        raise HTTPException(404, "Week template not found")

    template_tasks = cast(list[dict[str, Any]], tmpl.tasks_json or [])

    max_order = (
        db.query(WeekTask.order_index)
        .filter(WeekTask.user_id == current_user_row.id)
        .order_by(WeekTask.order_index.desc())
        .first()
    )
    next_order = (max_order[0] + 1) if max_order else 0

    created_tasks: list[WeekTask] = []

    for idx, t in enumerate(template_tasks):
        start_offset = int(t.get("start_offset", 0))
        end_offset = int(t.get("end_offset", start_offset))

        if end_offset < start_offset:
            end_offset = start_offset

        start_date = body.week_start + timedelta(days=start_offset)
        end_date = body.week_start + timedelta(days=end_offset)

        row = WeekTask(
            user_id=current_user_row.id,
            name=t.get("name", ""),
            start_date=start_date,
            end_date=end_date,
            category=t.get("category"),
            important=bool(t.get("important", False)),
            status=int(t.get("status", 0)),
            task_type=t.get("task_type", "normal"),
            repeat_days=t.get("repeat_days") or [],
            volume_value=t.get("volume_value"),
            subtasks=t.get("subtasks") or [],
            order_index=next_order + idx,
        )
        db.add(row)
        created_tasks.append(row)

    # Нужны id созданных задач до синка задач дня.
    db.flush()

    # Как и при обычном создании недельной задачи — заводим соответствующие
    # DayTask на дни диапазона, иначе шаблон не «доезжает» в план дня.
    from routers.week import _sync_day_tasks_for_week_task

    for row in created_tasks:
        _sync_day_tasks_for_week_task(db, row, current_user_row.id)

    db.commit()

    for row in created_tasks:
        db.refresh(row)

    return [_week_task_model_to_out(row) for row in created_tasks]
