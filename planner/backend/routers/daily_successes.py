from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from db import DailySuccess, TaskCategory, User
from dependencies import get_current_user, get_db

router = APIRouter(prefix="/daily-successes", tags=["daily successes"])


class DailySuccessIn(BaseModel):
    day: date
    text: str = Field(min_length=1, max_length=1500)
    category_id: int | None = Field(default=None, gt=0)

    @field_validator("text")
    @classmethod
    def clean_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Напиши, что получилось")
        return value


def enabled_user(user: User = Depends(get_current_user)):
    if not user.daily_successes_enabled:
        raise HTTPException(403, "Включи успехи за день в экспериментальных функциях")
    return user


def category_for(db, user_id, category_id):
    if category_id is None:
        return None
    category = db.query(TaskCategory).filter(
        TaskCategory.id == category_id, TaskCategory.user_id == user_id,
    ).first()
    if category is None:
        raise HTTPException(404, "Категория не найдена")
    return category


def serialize_category(category):
    return {
        "id": category.id, "key": category.key, "title": category.title,
        "color": category.color, "icon": category.icon,
    } if category else None


def serialize(row, category):
    return {
        "id": row.id, "day": row.day.isoformat(), "text": row.text,
        "category": serialize_category(category),
    }


def in_period(query, start_date, end_date):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(400, "Дата начала должна быть раньше даты окончания")
    if start_date:
        query = query.filter(DailySuccess.day >= start_date)
    if end_date:
        query = query.filter(DailySuccess.day <= end_date)
    return query


@router.get("/summary")
def summarize_successes(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(enabled_user),
):
    # Aggregate the whole period, independently of the paginated history.
    totals = in_period(db.query(
        func.count(DailySuccess.id), func.count(func.distinct(DailySuccess.day)),
    ).filter(DailySuccess.user_id == user.id), start_date, end_date).one()
    groups = in_period(db.query(
        TaskCategory, func.count(DailySuccess.id).label("total"),
        func.count(func.distinct(DailySuccess.day)).label("days"),
    ).select_from(DailySuccess).outerjoin(TaskCategory, DailySuccess.category_id == TaskCategory.id)
        .filter(DailySuccess.user_id == user.id), start_date, end_date)
    rows = groups.group_by(TaskCategory.id).order_by(
        func.count(DailySuccess.id).desc(), TaskCategory.title.asc().nullslast(),
    ).all()
    return {
        "total": totals[0], "days": totals[1],
        "categories": [{
            "category": serialize_category(category),
            "total": total, "days": days,
        } for category, total, days in rows],
    }


@router.get("")
def list_successes(
    start_date: date | None = None,
    end_date: date | None = None,
    category_id: int | None = Query(None, gt=0),
    category_ids: list[Annotated[int, Field(gt=0)]] | None = Query(None, max_length=100),
    uncategorized: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(enabled_user),
):
    if category_id is not None and (uncategorized or category_ids):
        raise HTTPException(400, "Выбери один фильтр категории")
    query = db.query(DailySuccess, TaskCategory).outerjoin(
        TaskCategory, DailySuccess.category_id == TaskCategory.id,
    ).filter(DailySuccess.user_id == user.id)
    query = in_period(query, start_date, end_date)
    selected_categories = category_ids or ([category_id] if category_id is not None else [])
    filters = []
    if selected_categories:
        filters.append(DailySuccess.category_id.in_(selected_categories))
    if uncategorized:
        filters.append(DailySuccess.category_id.is_(None))
    if filters:
        query = query.filter(or_(*filters))
    rows = query.order_by(DailySuccess.day.desc(), DailySuccess.id.desc()).offset(offset).limit(limit + 1).all()
    return {"items": [serialize(row, category) for row, category in rows[:limit]], "has_more": len(rows) > limit}


@router.post("", status_code=201)
def create_success(body: DailySuccessIn, db: Session = Depends(get_db), user: User = Depends(enabled_user)):
    category = category_for(db, user.id, body.category_id)
    row = DailySuccess(user_id=user.id, day=body.day, text=body.text, category_id=body.category_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return serialize(row, category)


def owned_success(db, user_id, success_id):
    row = db.query(DailySuccess).filter(DailySuccess.id == success_id, DailySuccess.user_id == user_id).first()
    if row is None:
        raise HTTPException(404, "Запись не найдена")
    return row


@router.put("/{success_id}")
def update_success(success_id: int, body: DailySuccessIn, db: Session = Depends(get_db), user: User = Depends(enabled_user)):
    row = owned_success(db, user.id, success_id)
    category = category_for(db, user.id, body.category_id)
    row.day, row.text, row.category_id = body.day, body.text, body.category_id
    db.commit()
    db.refresh(row)
    return serialize(row, category)


@router.delete("/{success_id}")
def delete_success(success_id: int, db: Session = Depends(get_db), user: User = Depends(enabled_user)):
    row = owned_success(db, user.id, success_id)
    db.delete(row)
    db.commit()
    return {"ok": True}
