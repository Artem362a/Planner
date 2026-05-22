from __future__ import annotations

from datetime import date, timedelta
from typing import Any, cast
import re

from sqlalchemy.orm import Session

from db import TaskCategory, User
from schemas import (
    CategoryOut,
    DayTaskRow,
    DayTemplateOut,
    DayTemplateRow,
    GoalOut,
    GoalStageOut,
    NotificationOut,
    SubTask,
    TaskCategoryRow,
    TaskOut,
    TemplateTask,
    UserResponse,
    WeekImportCandidateOut,
    WeekSubTask,
    WeekTemplateTaskIn,
    WeekTaskOut,
    WeekTaskRow,
    WeekTemplateOut,
    WeekTemplateRow,
)

__all__ = [
    "_notification_to_out",
    "_user_to_out",
    "_goal_progress",
    "_sync_goal_status",
    "_goal_to_out",
    "_category_to_out",
    "_task_to_out",
    "_template_to_out",
    "_week_template_to_out",
    "_week_task_model_to_out",
    "_make_category_key",
    "_make_unique_category_key",
    "_is_week_task_available_on_day",
    "_week_task_to_import_candidate",
    "_format_week_goal_date",
    "_recurring_goal_hits_week",
]

def _notification_to_out(recipient_row: Any) -> NotificationOut:
    notification = recipient_row.notification

    return NotificationOut(
        id=notification.id,
        title=notification.title,
        message=notification.message,
        created_at=notification.created_at.isoformat(),
        is_read=bool(recipient_row.is_read),
    )

def _user_to_out(user: User) -> UserResponse:
    row = cast(Any, user)
    raw_start = getattr(row, "default_day_start_time", None)
    if raw_start is None:
        start_str = "06:00"
    else:
        start_str = raw_start.strftime("%H:%M")
    return UserResponse(
        id=row.id,
        email=row.email,
        username=row.username,
        role=row.role,
        avatar=getattr(row, "avatar", None),
        theme=getattr(row, "theme", "light") or "light",
        default_day_start_time=start_str,
    )


def _goal_progress(goal: Any) -> float:
    stages = list(goal.stages or [])

    if len(stages) == 0:
        return 1.0 if goal.status == "done" else 0.0

    total = len(stages)
    done = sum(1 for stage in stages if bool(stage.done))
    return done / total

def _sync_goal_status(goal: Any) -> None:
    stages = list(goal.stages or [])

    if len(stages) == 0:
        return

    all_done = all(bool(stage.done) for stage in stages)
    goal.status = "done" if all_done else "active"


def _goal_to_out(goal: Any) -> GoalOut:
    stages = list(goal.stages or [])
    progress = _goal_progress(goal)

    return GoalOut(
        id=goal.id,
        title=goal.title,
        description=goal.description,
        color=goal.color,
        status=goal.status,
        order_index=goal.order_index,
        created_at=goal.created_at.isoformat(),
        goal_type=getattr(goal, "goal_type", "one_time") or "one_time",
        target_date=getattr(goal, "target_date", None),
        repeat_unit=getattr(goal, "repeat_unit", None),
        has_stages=bool(getattr(goal, "has_stages", False)),
        schedule_mode=getattr(goal, "schedule_mode", None),
        category_key=getattr(goal, "category_key", None),
        stages=[
            GoalStageOut(
                id=stage.id,
                title=stage.title,
                done=stage.done,
                order_index=stage.order_index,
                planned_date=getattr(stage, "planned_date", None),
            )
            for stage in stages
        ],
        progress=progress,
        day_done=bool(getattr(goal, "day_done", False)),
        is_focus=bool(getattr(goal, "is_focus", False)),
    )


def _category_to_out(row: TaskCategoryRow) -> CategoryOut:
    return CategoryOut(
        id=row.id,
        key=row.key,
        title=row.title,
        color=row.color,
        icon=getattr(row, "icon", "tag") or "tag",
    )


def _task_to_out(t: DayTaskRow) -> TaskOut:
    return TaskOut(
        id=t.id,
        day=t.day,
        title=t.title,
        start_time=t.start_time.isoformat() if t.start_time else None,
        duration_min=t.duration_min,
        priority=t.priority,
        category=t.category,
        status=t.status,
        subtasks=t.subtasks or [],
        order_index=t.order_index,
        source_week_task_id=t.source_week_task_id,
    )

def _template_to_out(tmpl: DayTemplateRow) -> DayTemplateOut:
    tasks_raw = cast(list[dict[str, Any]] | None, tmpl.tasks_json) or []
    return DayTemplateOut(
        id=tmpl.id,
        name=tmpl.name,
        color=tmpl.color,
        tasks=[TemplateTask(**task) for task in tasks_raw],
    )


def _week_template_to_out(tmpl: WeekTemplateRow) -> WeekTemplateOut:
    tasks_raw = cast(list[dict[str, Any]] | None, tmpl.tasks_json) or []
    return WeekTemplateOut(
        id=tmpl.id,
        name=tmpl.name,
        color=tmpl.color,
        tasks=[WeekTemplateTaskIn(**task) for task in tasks_raw],
    )


def _week_task_model_to_out(row: Any) -> WeekTaskOut:
    subtasks_raw = cast(list[dict[str, Any]] | None, row.subtasks) or []
    repeat_days_raw = cast(list[int] | None, row.repeat_days) or []

    return WeekTaskOut(
        id=row.id,
        name=row.name,
        start_date=row.start_date,
        end_date=row.end_date,
        category=row.category,
        important=row.important,
        status=row.status,
        task_type=row.task_type or "normal",
        repeat_days=repeat_days_raw,
        volume_value=row.volume_value,
        order_index=row.order_index,
        subtasks=[
            WeekSubTask(
                id=s.get("id"),
                title=str(s.get("title", "")),
                done=bool(s.get("done")),
            )
            for s in subtasks_raw
        ],
    )


def _make_category_key(title: str) -> str:
    base = title.strip().lower()
    base = re.sub(r"\s+", "_", base)
    base = re.sub(r"[^a-zA-Zа-яА-Я0-9_]+", "", base)
    if not base:
        base = "category"
    return base


def _make_unique_category_key(db: Session, user_id: int, title: str) -> str:
    base = _make_category_key(title)
    candidate = base
    index = 1

    while (
        db.query(TaskCategory)
        .filter(
            TaskCategory.user_id == user_id,
            TaskCategory.key == candidate,
        )
        .first()
    ):
        candidate = f"{base}_{index}"
        index += 1

    return candidate


def _is_week_task_available_on_day(task: WeekTaskRow, target_day: date) -> bool:
    if (task.task_type or "").strip() == "recurring":
        raw_repeat_days = cast(list[Any] | None, task.repeat_days) or []
        repeat_days: list[int] = []

        for day_value in raw_repeat_days:
            try:
                repeat_days.append(int(day_value))
            except (TypeError, ValueError):
                continue

        return target_day.weekday() in repeat_days

    return task.start_date <= target_day <= task.end_date


def _week_task_to_import_candidate(
    task: WeekTaskRow,
    import_day: date,
    is_overdue: bool = False,
) -> WeekImportCandidateOut:
    subtasks_raw = cast(list[dict[str, Any]] | None, task.subtasks) or []

    if (task.task_type or "").strip() == "recurring":
        start_date = import_day
        end_date = import_day
    else:
        start_date = task.start_date
        end_date = task.end_date

    return WeekImportCandidateOut(
        week_task_id=task.id,
        import_day=import_day,
        title=task.name,
        category=task.category,
        important=task.important,
        task_type=task.task_type or "normal",
        subtasks=[SubTask(**s) for s in subtasks_raw],
        start_date=start_date,
        end_date=end_date,
        is_overdue=is_overdue,
    )

def _format_week_goal_date(value: date | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%d.%m")


def _recurring_goal_hits_week(goal: Any, week_start: date, week_end: date) -> bool:
    repeat_unit = getattr(goal, "repeat_unit", None)

    if repeat_unit == "day":
        return True
    if repeat_unit == "week":
        return True
    if repeat_unit == "month":
        cursor = week_start
        while cursor <= week_end:
            if cursor.day == 1:
                return True
            cursor += timedelta(days=1)

    return False

