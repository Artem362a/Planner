from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from db import TaskCategory

BASE_DIR = Path(__file__).resolve().parent
DOCS_DIR = BASE_DIR / "docs"


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
