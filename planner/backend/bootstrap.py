from __future__ import annotations

from pathlib import Path

from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.orm import Session

from db import SCHEMAS, TaskCategory, engine

BASE_DIR = Path(__file__).resolve().parent
DOCS_DIR = BASE_DIR / "docs"


def _columns(schema: str, table_name: str) -> set[str]:
    return {col["name"] for col in sa_inspect(engine).get_columns(table_name, schema=schema)}


def ensure_schemas() -> None:
    """Create all domain schemas if they don't exist yet. Must run before
    `Base.metadata.create_all`, otherwise SQLAlchemy will fail trying to
    place tables into missing namespaces."""
    with engine.begin() as conn:
        for schema in SCHEMAS:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))


def ensure_task_category_icon_column() -> None:
    if "icon" not in _columns("planning", "task_categories"):
        with engine.connect() as conn:
            conn.exec_driver_sql(
                "ALTER TABLE planning.task_categories ADD COLUMN icon VARCHAR NOT NULL DEFAULT 'tag'"
            )
            conn.commit()


def ensure_user_avatar_column() -> None:
    if "avatar" not in _columns("auth", "users"):
        with engine.connect() as conn:
            conn.exec_driver_sql("ALTER TABLE auth.users ADD COLUMN avatar TEXT")
            conn.commit()


def ensure_goal_columns() -> None:
    cols = _columns("goals", "goals")
    with engine.connect() as conn:
        if "goal_type" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE goals.goals ADD COLUMN goal_type VARCHAR NOT NULL DEFAULT 'one_time'"
            )
        if "target_date" not in cols:
            conn.exec_driver_sql("ALTER TABLE goals.goals ADD COLUMN target_date DATE")
        if "repeat_unit" not in cols:
            conn.exec_driver_sql("ALTER TABLE goals.goals ADD COLUMN repeat_unit VARCHAR")
        if "has_stages" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE goals.goals ADD COLUMN has_stages BOOLEAN NOT NULL DEFAULT FALSE"
            )
        if "schedule_mode" not in cols:
            conn.exec_driver_sql("ALTER TABLE goals.goals ADD COLUMN schedule_mode VARCHAR")
        if "category_key" not in cols:
            conn.exec_driver_sql("ALTER TABLE goals.goals ADD COLUMN category_key VARCHAR")
        conn.commit()


def ensure_goal_stage_columns() -> None:
    if "planned_date" not in _columns("goals", "goal_stages"):
        with engine.connect() as conn:
            conn.exec_driver_sql("ALTER TABLE goals.goal_stages ADD COLUMN planned_date DATE")
            conn.commit()


DEFAULT_CATEGORIES = [
    {"key": "home", "title": "Домашние дела", "color": "#9AC6FF", "icon": "home"},
    {"key": "university", "title": "Учёба", "color": "#E07070", "icon": "book"},
    {"key": "health", "title": "Здоровье и спорт", "color": "#7ECF8A", "icon": "heart"},
    {"key": "cleaning", "title": "Уборка", "color": "#F3E3B0", "icon": "sparkle"},
    {"key": "planning", "title": "Планирование", "color": "#B3C0F5", "icon": "calendar"},
    {"key": "self_dev", "title": "Саморазвитие и навыки", "color": "#D48ABF", "icon": "code"},
    {"key": "prep_day", "title": "Подготовка ко дню", "color": "#C0C0C0", "icon": "sun"},
    {"key": "sleep", "title": "Сон и восстановление", "color": "#A8B6C4", "icon": "moon"},
    {"key": "break", "title": "Перерыв", "color": "#F2D573", "icon": "coffee"},
    {"key": "career", "title": "Карьера", "color": "#6BAF6B", "icon": "briefcase"},
    {"key": "other", "title": "Другое", "color": "#BBBBBB", "icon": "tag"},
]


def ensure_feedback_screenshots_column() -> None:
    if "screenshots" not in _columns("feedback", "feedback_messages"):
        with engine.connect() as conn:
            conn.exec_driver_sql("ALTER TABLE feedback.feedback_messages ADD COLUMN screenshots JSON")
            conn.commit()


def ensure_user_theme_column() -> None:
    cols = _columns("auth", "users")
    with engine.connect() as conn:
        if "theme" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE auth.users ADD COLUMN theme VARCHAR NOT NULL DEFAULT 'light'"
            )
        if "default_day_start_time" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE auth.users ADD COLUMN default_day_start_time TIME NOT NULL DEFAULT '06:00:00'"
            )
        # The 'system' option was removed from the UI; migrate any leftovers
        # to 'light' and bring the column default in line with the new model.
        conn.exec_driver_sql("ALTER TABLE auth.users ALTER COLUMN theme SET DEFAULT 'light'")
        conn.exec_driver_sql("UPDATE auth.users SET theme = 'light' WHERE theme = 'system'")
        conn.commit()


def ensure_default_categories_for_user(db: Session, user_id: int) -> None:
    existing = (
        db.query(TaskCategory)
        .filter(TaskCategory.user_id == user_id)
        .count()
    )
    if existing > 0:
        return

    for item in DEFAULT_CATEGORIES:
        db.add(
            TaskCategory(
                user_id=user_id,
                key=item["key"],
                title=item["title"],
                color=item["color"],
                icon=item["icon"],
            )
        )

    db.commit()
