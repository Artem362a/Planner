from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import (
    DayTask,
    TaskCategory,
    User,
    WeekTask,
)
from dependencies import get_current_user, get_db
from schemas import *
from serializers import *

router = APIRouter()

@router.get("/categories", response_model=list[CategoryOut])
def get_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    rows = (
        db.query(TaskCategory)
        .filter(TaskCategory.user_id == current_user_row.id)
        .order_by(TaskCategory.title.asc())
        .all()
    )
    return [_category_to_out(cast(TaskCategoryRow, row)) for row in rows]


@router.post("/categories", response_model=CategoryOut)
def create_category(
    body: CategoryIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Category title is required")

    key = _make_unique_category_key(db, current_user_row.id, title)

    row = TaskCategory(
        user_id=current_user_row.id,
        key=key,
        title=title,
        color=body.color,
        icon=body.icon,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return _category_to_out(cast(TaskCategoryRow, row))


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    body: CategoryUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    db_row = (
        db.query(TaskCategory)
        .filter(
            TaskCategory.id == category_id,
            TaskCategory.user_id == current_user_row.id,
        )
        .first()
    )
    if not db_row:
        raise HTTPException(404, "Category not found")

    row = cast(TaskCategoryRow, db_row)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Category title is required")

    row.title = title
    row.color = body.color
    row.icon = body.icon

    db.commit()
    db.refresh(db_row)

    return _category_to_out(cast(TaskCategoryRow, db_row))


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    db_row = (
        db.query(TaskCategory)
        .filter(
            TaskCategory.id == category_id,
            TaskCategory.user_id == current_user_row.id,
        )
        .first()
    )
    if not db_row:
        raise HTTPException(404, "Category not found")

    row = cast(TaskCategoryRow, db_row)

    if row.key == "other":
        raise HTTPException(400, "Category 'other' cannot be deleted")

    other_db = (
        db.query(TaskCategory)
        .filter(
            TaskCategory.user_id == current_user_row.id,
            TaskCategory.key == "other",
        )
        .first()
    )
    if not other_db:
        raise HTTPException(500, "Fallback category 'other' not found")

    other = cast(TaskCategoryRow, other_db)

    db.query(DayTask).filter(
        DayTask.user_id == current_user_row.id,
        DayTask.category == row.key,
    ).update({"category": other.key}, synchronize_session=False)

    db.query(WeekTask).filter(
        WeekTask.user_id == current_user_row.id,
        WeekTask.category == row.key,
    ).update({"category": other.key}, synchronize_session=False)

    db.delete(db_row)
    db.commit()
    return {"ok": True}
