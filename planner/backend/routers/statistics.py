from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db import DayTask, Goal, GoalCheckin, GoalStage, TaskCategory
from dependencies import get_current_user, get_db

router = APIRouter()


@router.get("/statistics")
def get_statistics(
    period_days: int = Query(30, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    end_date = date.today()
    start_date = end_date - timedelta(days=period_days - 1)

    # ── Day tasks in period ─────────────────────────────────────────────────
    day_tasks = (
        db.query(DayTask)
        .filter(
            DayTask.user_id == current_user.id,
            DayTask.day >= start_date,
            DayTask.day <= end_date,
        )
        .all()
    )

    total_tasks = len(day_tasks)
    completed_tasks = sum(1 for t in day_tasks if t.status == 1)
    completion_rate = (
        round(completed_tasks / total_tasks * 100, 1) if total_tasks > 0 else 0
    )

    # ── By day (fill every date in range, including zeros) ──────────────────
    day_bucket: dict[str, dict] = defaultdict(lambda: {"total": 0, "completed": 0})
    for t in day_tasks:
        key = t.day.isoformat()
        day_bucket[key]["total"] += 1
        if t.status == 1:
            day_bucket[key]["completed"] += 1

    by_day = []
    cur = start_date
    while cur <= end_date:
        key = cur.isoformat()
        by_day.append({"date": key, **day_bucket[key]})
        cur += timedelta(days=1)

    # ── By category ─────────────────────────────────────────────────────────
    categories = (
        db.query(TaskCategory)
        .filter(TaskCategory.user_id == current_user.id)
        .all()
    )
    cat_map = {
        c.key: {
            "key": c.key,
            "title": c.title,
            "color": c.color,
            "total": 0,
            "completed": 0,
        }
        for c in categories
    }
    for t in day_tasks:
        if t.category in cat_map:
            cat_map[t.category]["total"] += 1
            if t.status == 1:
                cat_map[t.category]["completed"] += 1

    by_category = [v for v in cat_map.values() if v["total"] > 0]

    # ── By priority ─────────────────────────────────────────────────────────
    by_priority: dict[str, dict] = {
        "high": {"total": 0, "completed": 0},
        "medium": {"total": 0, "completed": 0},
    }
    for t in day_tasks:
        p = t.priority if t.priority in ("high", "medium") else "medium"
        by_priority[p]["total"] += 1
        if t.status == 1:
            by_priority[p]["completed"] += 1

    total_planned_min = sum(t.duration_min or 0 for t in day_tasks)

    # ── Streak (по всем данным, не ограничен выбранным периодом) ───────────
    completed_days = [
        row[0]
        for row in (
            db.query(DayTask.day)
            .filter(DayTask.user_id == current_user.id, DayTask.status == 1)
            .distinct()
            .order_by(DayTask.day)
            .all()
        )
        if row[0] <= end_date
    ]
    completed_day_set = set(completed_days)

    current_streak = 0
    probe = end_date
    while probe in completed_day_set:
        current_streak += 1
        probe -= timedelta(days=1)

    best_streak = temp = 0
    prev = None
    for d in completed_days:
        temp = temp + 1 if prev is not None and d == prev + timedelta(days=1) else 1
        best_streak = max(best_streak, temp)
        prev = d

    # ── Best day ────────────────────────────────────────────────────────────
    best_day_entry = max(by_day, key=lambda d: d["completed"], default=None)
    best_day = (
        best_day_entry
        if (best_day_entry and best_day_entry["completed"] > 0)
        else None
    )

    # ── Goals (all-time counts) ──────────────────────────────────────────────
    goals = db.query(Goal).filter(Goal.user_id == current_user.id).all()
    goals_by_status: dict[str, int] = {"active": 0, "done": 0, "archived": 0}
    for g in goals:
        if g.status in goals_by_status:
            goals_by_status[g.status] += 1

    # ── Goals: stages summary + per-active progress + recurring adherence ─────
    goal_ids = [g.id for g in goals]
    stages = (
        db.query(GoalStage).filter(GoalStage.goal_id.in_(goal_ids)).all()
        if goal_ids
        else []
    )
    stages_by_goal: dict[int, list] = defaultdict(list)
    for s in stages:
        stages_by_goal[s.goal_id].append(s)

    # Сводка «этапов закрыто» — только по активным целям (завершённые и
    # архивные не должны раздувать число).
    active_goal_ids = {g.id for g in goals if g.status == "active"}
    active_stages = [s for s in stages if s.goal_id in active_goal_ids]
    total_stages = len(active_stages)
    done_stages = sum(1 for s in active_stages if s.done)

    # Отметки регулярных целей за период (реальные даты — по ним серия и «X из N»).
    checkins = (
        db.query(GoalCheckin)
        .filter(
            GoalCheckin.user_id == current_user.id,
            GoalCheckin.check_date >= start_date,
            GoalCheckin.check_date <= end_date,
        )
        .all()
        if goal_ids
        else []
    )
    done_checkin_dates: dict[int, set] = defaultdict(set)
    for c in checkins:
        if c.done:
            done_checkin_dates[c.goal_id].add(c.check_date)

    def _recurring_applicable_dates(goal_row):
        out = []
        cur = start_date
        while cur <= end_date:
            hits = (
                goal_row.repeat_unit == "day"
                or (goal_row.repeat_unit == "week" and cur.weekday() == 0)
                or (goal_row.repeat_unit == "month" and cur.day == 1)
            )
            within = goal_row.target_date is None or cur <= goal_row.target_date
            if hits and within:
                out.append(cur)
            cur += timedelta(days=1)
        return out

    active_progress = []
    recurring_progress = []
    for g in goals:
        if g.status != "active":
            continue

        if (g.goal_type or "one_time") == "recurring":
            applicable = _recurring_applicable_dates(g)
            done_set = done_checkin_dates.get(g.id, set())
            done_count = sum(1 for d in applicable if d in done_set)
            # Серия: сколько подряд применимых дат (от последней ≤ сегодня)
            # отмечено. Сегодняшний день ещё не завершён — если он применим и
            # пока не отмечен, не рвём им серию (прощаем текущий день).
            streak_seq = applicable
            if streak_seq and streak_seq[-1] == end_date and end_date not in done_set:
                streak_seq = streak_seq[:-1]
            streak = 0
            for d in reversed(streak_seq):
                if d in done_set:
                    streak += 1
                else:
                    break
            recurring_progress.append(
                {
                    "id": g.id,
                    "title": g.title,
                    "color": g.color,
                    "category_key": g.category_key,
                    "repeat_unit": g.repeat_unit,
                    "done": done_count,
                    "applicable": len(applicable),
                    "streak": streak,
                }
            )
        else:
            gstages = stages_by_goal.get(g.id, [])
            if not gstages:
                continue
            active_progress.append(
                {
                    "id": g.id,
                    "title": g.title,
                    "color": g.color,
                    "category_key": g.category_key,
                    "done": sum(1 for s in gstages if s.done),
                    "total": len(gstages),
                }
            )

    # Ближе к завершению — выше (по доле готовых этапов).
    active_progress.sort(
        key=lambda p: (p["done"] / p["total"] if p["total"] else 0), reverse=True
    )

    return {
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "days": period_days,
        },
        "tasks": {
            "total": total_tasks,
            "completed": completed_tasks,
            "completion_rate": completion_rate,
            "by_day": by_day,
            "by_category": by_category,
            "by_priority": by_priority,
            "total_planned_min": total_planned_min,
        },
        "goals": {
            "total": len(goals),
            **goals_by_status,
            "stages": {"total": total_stages, "done": done_stages},
            "active_progress": active_progress,
            "recurring_progress": recurring_progress,
        },
        "streak": {"current": current_streak, "best": best_streak},
        "best_day": best_day,
    }
