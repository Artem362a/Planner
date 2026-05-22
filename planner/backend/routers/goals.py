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

@router.get("/goals/week", response_model=list[GoalWeekItemOut])
def list_goals_for_week(
    week_start: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)
    week_end = week_start + timedelta(days=6)

    rows = (
        db.query(Goal)
        .filter(
            Goal.user_id == current_user_row.id,
            Goal.status != "archived",
            Goal.status != "done",
        )
        .order_by(Goal.order_index.asc(), Goal.id.desc())
        .all()
    )

    checkins = (
        db.query(GoalCheckin)
        .filter(
            GoalCheckin.user_id == current_user_row.id,
            GoalCheckin.check_date == week_start,
        )
        .all()
    )
    checkins_by_goal_id = {
        cast(Any, row).goal_id: bool(cast(Any, row).done) for row in checkins
    }

    result: list[GoalWeekItemOut] = []

    for goal in rows:
        goal_row = cast(Any, goal)
        stages = list(goal_row.stages or [])
        planned_stages = [
            stage
            for stage in stages
            if getattr(stage, "planned_date", None) is not None
            and week_start <= cast(Any, stage).planned_date <= week_end
        ]

        for stage in planned_stages:
            stage_row = cast(Any, stage)
            result.append(
                GoalWeekItemOut(
                    id=f"stage-{stage_row.id}",
                    kind="stage",
                    goal_id=goal_row.id,
                    stage_id=stage_row.id,
                    goal_title=goal_row.title,
                    title=stage_row.title,
                    meta=f"этап на {_format_week_goal_date(stage_row.planned_date)}",
                    color=goal_row.color,
                    done=bool(stage_row.done),
                )
            )

        if planned_stages:
            continue

        goal_type = goal_row.goal_type or "one_time"
        target_date = getattr(goal_row, "target_date", None)

        if goal_type == "recurring":
            if not _recurring_goal_hits_week(goal_row, week_start, week_end):
                continue

            repeat_unit = getattr(goal_row, "repeat_unit", None)
            if repeat_unit == "day":
                meta = "регулярная, каждый день"
            elif repeat_unit == "week":
                meta = "регулярная, еженедельно"
            elif repeat_unit == "month":
                meta = "регулярная, ежемесячно"
            else:
                meta = "регулярная"

            result.append(
                GoalWeekItemOut(
                    id=f"goal-{goal_row.id}",
                    kind="goal",
                    goal_id=goal_row.id,
                    stage_id=None,
                    goal_title=goal_row.title,
                    title=goal_row.title,
                    meta=meta,
                    color=goal_row.color,
                    done=checkins_by_goal_id.get(goal_row.id, False),
                )
            )
            continue

        if target_date is not None and week_start <= target_date <= week_end:
            result.append(
                GoalWeekItemOut(
                    id=f"goal-{goal_row.id}",
                    kind="goal",
                    goal_id=goal_row.id,
                    stage_id=None,
                    goal_title=goal_row.title,
                    title=goal_row.title,
                    meta=f"дедлайн {_format_week_goal_date(target_date)}",
                    color=goal_row.color,
                    done=goal_row.status == "done",
                )
            )

    return result


@router.patch("/goals/week-item/toggle")
def toggle_goal_week_item(
    body: GoalWeekItemToggleIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    goal = (
        db.query(Goal)
        .filter(
            Goal.id == body.goal_id,
            Goal.user_id == current_user_row.id,
        )
        .first()
    )
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    goal_row = cast(Any, goal)

    if body.kind == "stage":
        if body.stage_id is None:
            raise HTTPException(status_code=400, detail="Stage id is required")

        stage = (
            db.query(GoalStage)
            .filter(
                GoalStage.id == body.stage_id,
                GoalStage.goal_id == goal_row.id,
            )
            .first()
        )
        if stage is None:
            raise HTTPException(status_code=404, detail="Goal stage not found")

        stage_row = cast(Any, stage)
        stage_row.done = not bool(stage_row.done)
        db.flush()
        db.refresh(goal_row)
        _sync_goal_status(goal_row)
        db.commit()

        return {"done": bool(stage_row.done)}

    if (goal_row.goal_type or "one_time") == "recurring":
        checkin = (
            db.query(GoalCheckin)
            .filter(
                GoalCheckin.goal_id == goal_row.id,
                GoalCheckin.user_id == current_user_row.id,
                GoalCheckin.check_date == body.week_start,
            )
            .first()
        )

        if checkin is None:
            checkin = GoalCheckin(
                goal_id=goal_row.id,
                user_id=current_user_row.id,
                check_date=body.week_start,
                done=True,
            )
            db.add(checkin)
            done = True
        else:
            checkin_row = cast(Any, checkin)
            checkin_row.done = not bool(checkin_row.done)
            done = bool(checkin_row.done)

        db.commit()
        return {"done": done}

    goal_row.status = "done" if goal_row.status != "done" else "active"
    db.commit()

    return {"done": goal_row.status == "done"}


@router.patch("/goals/day-item/toggle", response_model=GoalOut)
def toggle_goal_day_item(
    body: GoalDayItemToggleIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    goal = (
        db.query(Goal)
        .filter(
            Goal.id == body.goal_id,
            Goal.user_id == current_user_row.id,
        )
        .first()
    )
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    goal_row = cast(Any, goal)

    if body.stage_id is not None:
        stage = (
            db.query(GoalStage)
            .filter(
                GoalStage.id == body.stage_id,
                GoalStage.goal_id == goal_row.id,
            )
            .first()
        )
        if stage is None:
            raise HTTPException(status_code=404, detail="Goal stage not found")

        stage_row = cast(Any, stage)
        stage_row.done = not bool(stage_row.done)

        db.flush()
        db.refresh(goal_row)
        _sync_goal_status(goal_row)
        db.commit()
        db.refresh(goal_row)

        return _goal_to_out(goal_row)

    if (goal_row.goal_type or "one_time") == "recurring":
        checkin = (
            db.query(GoalCheckin)
            .filter(
                GoalCheckin.goal_id == goal_row.id,
                GoalCheckin.user_id == current_user_row.id,
                GoalCheckin.check_date == body.day,
            )
            .first()
        )

        if checkin is None:
            checkin = GoalCheckin(
                goal_id=goal_row.id,
                user_id=current_user_row.id,
                check_date=body.day,
                done=True,
            )
            db.add(checkin)
        else:
            checkin_row = cast(Any, checkin)
            checkin_row.done = not bool(checkin_row.done)

        db.commit()
        db.refresh(goal_row)
        setattr(goal_row, "day_done", bool(cast(Any, checkin).done))

        return _goal_to_out(goal_row)

    goal_row.status = "done" if goal_row.status != "done" else "active"
    db.commit()
    db.refresh(goal_row)

    return _goal_to_out(goal_row)

@router.get("/goals", response_model=list[GoalOut])
def list_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    rows = (
        db.query(Goal)
        .filter(Goal.user_id == current_user_row.id)
        .order_by(Goal.order_index.asc(), Goal.id.asc())
        .all()
    )

    return [_goal_to_out(row) for row in rows]


@router.post("/goals", response_model=GoalOut)
def create_goal(
    body: GoalIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Goal title is required")

    if body.goal_type == "one_time" and body.target_date is None:
        raise HTTPException(status_code=400, detail="Target date is required for one-time goal")

    if body.goal_type == "recurring" and not body.repeat_unit:
        raise HTTPException(status_code=400, detail="Repeat unit is required for recurring goal")

    if body.goal_type == "recurring" and body.target_date is None:
        raise HTTPException(status_code=400, detail="Target date is required for recurring goal")

    max_order = (
        db.query(func.max(Goal.order_index))
        .filter(Goal.user_id == current_user_row.id)
        .scalar()
    )
    next_order = (max_order if max_order is not None else -1) + 1

    row = Goal(
        user_id=current_user_row.id,
        title=title,
        description=(body.description or "").strip() or None,
        color=body.color,
        status=body.status,
        goal_type=body.goal_type,
        target_date=body.target_date,
        repeat_unit=body.repeat_unit if body.goal_type == "recurring" else None,
        has_stages=body.has_stages,
        schedule_mode=body.schedule_mode if body.has_stages else None,
        category_key=body.category_key or None,
        order_index=next_order,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return _goal_to_out(row)


@router.patch("/goals/{goal_id}/focus", response_model=GoalOut)
def toggle_goal_focus(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    row = (
        db.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == current_user_row.id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    row.is_focus = not bool(getattr(row, "is_focus", False))
    db.commit()
    db.refresh(row)
    return _goal_to_out(cast(Any, row))


@router.patch("/goals/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: int,
    body: GoalIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    row = (
        db.query(Goal)
        .filter(
            Goal.id == goal_id,
            Goal.user_id == current_user_row.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Goal not found")

    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Goal title is required")

    row.title = title
    row.description = (body.description or "").strip() or None
    row.color = body.color or "#7ECF8A"
    row.status = body.status or "active"
    row.goal_type = body.goal_type or "one_time"
    row.has_stages = bool(body.has_stages)
    row.schedule_mode = body.schedule_mode if row.has_stages else None
    row.category_key = body.category_key or None

    if row.goal_type == "recurring":
        row.repeat_unit = body.repeat_unit or "day"
        row.target_date = body.target_date
    else:
        row.repeat_unit = None
        row.target_date = body.target_date

    db.commit()
    db.refresh(row)

    return _goal_to_out(row)

@router.get("/goals/day/{day}", response_model=list[GoalOut])
def list_goals_for_day(
    day: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    try:
        target_day = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(status_code=400, detail="Bad date format, use YYYY-MM-DD")

    rows = (
        db.query(Goal)
        .filter(
            Goal.user_id == current_user_row.id,
            Goal.status != "done",
        )
        .order_by(Goal.order_index.asc(), Goal.id.asc())
        .all()
    )

    checkins = (
        db.query(GoalCheckin)
        .filter(
            GoalCheckin.user_id == current_user_row.id,
            GoalCheckin.check_date == target_day,
        )
        .all()
    )
    checkins_by_goal_id = {cast(Any, row).goal_id: bool(cast(Any, row).done) for row in checkins}

    # If any active goals are in focus — return only those
    focus_goals = [cast(Any, g) for g in rows if bool(getattr(cast(Any, g), "is_focus", False))]
    if focus_goals:
        result: list[GoalOut] = []
        for goal_row in focus_goals:
            setattr(goal_row, "day_done", checkins_by_goal_id.get(goal_row.id, False))
            result.append(_goal_to_out(goal_row))
        return result

    result: list[GoalOut] = []

    for goal in rows:
        goal_row = cast(Any, goal)
        include_goal = False
        if goal_row.target_date is not None and target_day > goal_row.target_date:
            continue

        if (goal_row.goal_type or "one_time") == "recurring":
            if goal_row.repeat_unit == "day":
                include_goal = True
            elif goal_row.repeat_unit == "week" and target_day.weekday() == 0:
                include_goal = True
            elif goal_row.repeat_unit == "month" and target_day.day == 1:
                include_goal = True

        elif goal_row.target_date == target_day:
            include_goal = True

        elif any(
            getattr(stage, "planned_date", None) == target_day
            for stage in (goal_row.stages or [])
        ):
            include_goal = True

        if include_goal:
            setattr(goal_row, "day_done", checkins_by_goal_id.get(goal_row.id, False))
            result.append(_goal_to_out(goal_row))

    return result

@router.delete("/goals/{goal_id}")
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    row = (
        db.query(Goal)
        .filter(
            Goal.id == goal_id,
            Goal.user_id == current_user_row.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(404, "Goal not found")

    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/goals/reorder")
def reorder_goals(
    body: GoalReorderIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    rows = (
        db.query(Goal)
        .filter(
            Goal.user_id == current_user_row.id,
            Goal.id.in_(body.ordered_ids),
        )
        .all()
    )

    if len(rows) != len(body.ordered_ids):
        raise HTTPException(404, "Some goals not found")

    row_map = {row.id: row for row in rows}
    for index, goal_id in enumerate(body.ordered_ids):
        row_map[goal_id].order_index = index

    db.commit()
    return {"ok": True}


@router.post("/goals/{goal_id}/stages", response_model=GoalOut)
def create_goal_stage(
    goal_id: int,
    body: GoalStageIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    goal = (
        db.query(Goal)
        .filter(
            Goal.id == goal_id,
            Goal.user_id == current_user_row.id,
        )
        .first()
    )
    if goal is None:
        raise HTTPException(404, "Goal not found")

    max_order = (
        db.query(func.max(GoalStage.order_index))
        .filter(GoalStage.goal_id == goal_id)
        .scalar()
    )
    next_order = (max_order if max_order is not None else -1) + 1

    stage = GoalStage(
    goal_id=goal_id,
    title=body.title.strip(),
    done=body.done,
    planned_date=body.planned_date,
    order_index=next_order,
    )
    db.add(stage)
    db.flush()

    db.refresh(goal)
    _sync_goal_status(goal)

    db.commit()
    db.refresh(goal)

    return _goal_to_out(goal)


@router.patch("/goals/{goal_id}/stages/{stage_id}", response_model=GoalOut)
def update_goal_stage(
    goal_id: int,
    stage_id: int,
    body: GoalStageIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    goal = (
        db.query(Goal)
        .filter(
            Goal.id == goal_id,
            Goal.user_id == current_user_row.id,
        )
        .first()
    )
    if goal is None:
        raise HTTPException(404, "Goal not found")

    stage = (
        db.query(GoalStage)
        .join(Goal, Goal.id == GoalStage.goal_id)
        .filter(
            GoalStage.id == stage_id,
            GoalStage.goal_id == goal_id,
            Goal.user_id == current_user_row.id,
        )
        .first()
    )
    if stage is None:
        raise HTTPException(404, "Goal stage not found")

    stage.title = body.title.strip()
    stage.done = body.done
    stage.planned_date = body.planned_date

    db.flush()
    db.refresh(goal)
    _sync_goal_status(goal)

    db.commit()
    db.refresh(goal)

    return _goal_to_out(goal)


@router.delete("/goals/{goal_id}/stages/{stage_id}", response_model=GoalOut)
def delete_goal_stage(
    goal_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    goal = (
        db.query(Goal)
        .filter(
            Goal.id == goal_id,
            Goal.user_id == current_user_row.id,
        )
        .first()
    )
    if goal is None:
        raise HTTPException(404, "Goal not found")

    stage = (
        db.query(GoalStage)
        .join(Goal, Goal.id == GoalStage.goal_id)
        .filter(
            GoalStage.id == stage_id,
            GoalStage.goal_id == goal_id,
            Goal.user_id == current_user_row.id,
        )
        .first()
    )
    if stage is None:
        raise HTTPException(404, "Goal stage not found")

    db.delete(stage)
    db.flush()

    db.refresh(goal)
    _sync_goal_status(goal)

    db.commit()
    db.refresh(goal)

    return _goal_to_out(goal)
