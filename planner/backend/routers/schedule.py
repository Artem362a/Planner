from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import DayTask, ScheduleEvent, ScheduleSubscription, User
from dependencies import get_current_user, get_db
from schedule_sync import (
    ALLOWED_SUBGROUPS,
    SAMARA_TZ,
    ScheduleSyncError,
    event_matches_subgroup,
    is_day_plan_protected,
    mask_feed_url,
    store_sync_error,
    sync_subscription,
    validate_feed_url,
    _event_from_row,
)
from schemas import (
    ScheduleEventOut,
    ScheduleSubscriptionIn,
    ScheduleSubscriptionOut,
    ScheduleSyncResultOut,
    ScheduleWeekOut,
)


router = APIRouter(prefix="/schedule", tags=["schedule"])


def _subscription_out(row: ScheduleSubscription | None) -> ScheduleSubscriptionOut:
    if row is None:
        return ScheduleSubscriptionOut(connected=False)
    return ScheduleSubscriptionOut(
        connected=True,
        feed_url_masked=mask_feed_url(row.feed_url),
        subgroup=cast(Any, row.subgroup),
        last_synced_at=row.last_synced_at.isoformat() if row.last_synced_at else None,
        last_attempt_at=row.last_attempt_at.isoformat() if row.last_attempt_at else None,
        last_error=row.last_error,
    )


@router.get("/subscription", response_model=ScheduleSubscriptionOut)
def get_schedule_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(ScheduleSubscription)
        .filter(ScheduleSubscription.user_id == current_user.id)
        .first()
    )
    return _subscription_out(row)


@router.post("/subscription", response_model=ScheduleSyncResultOut)
def save_schedule_subscription(
    body: ScheduleSubscriptionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(ScheduleSubscription)
        .filter(ScheduleSubscription.user_id == current_user.id)
        .first()
    )
    subgroup = body.subgroup if body.subgroup in ALLOWED_SUBGROUPS else "all"

    if row is None:
        if not body.feed_url:
            raise HTTPException(400, "Вставьте ссылку на расписание")
        row = ScheduleSubscription(
            user_id=current_user.id,
            feed_url=validate_feed_url(body.feed_url),
            subgroup=subgroup,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    else:
        changed = False
        if body.feed_url and body.feed_url.strip():
            new_url = validate_feed_url(body.feed_url)
            if new_url != row.feed_url:
                row.feed_url = new_url
                changed = True
        if subgroup != row.subgroup:
            row.subgroup = subgroup
            changed = True
        if changed:
            # Даже при неизменившемся файле новая ссылка/подгруппа требует
            # полного пересоздания задач на доступных днях.
            row.last_content_hash = None
        db.commit()

    try:
        result = sync_subscription(db, row)
    except ScheduleSyncError as exc:
        store_sync_error(db, row.id, str(exc))
        raise HTTPException(400, str(exc)) from exc
    return ScheduleSyncResultOut(**result)


@router.post("/sync", response_model=ScheduleSyncResultOut)
def sync_schedule_now(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(ScheduleSubscription)
        .filter(ScheduleSubscription.user_id == current_user.id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Расписание ещё не подключено")
    try:
        result = sync_subscription(db, row)
    except ScheduleSyncError as exc:
        store_sync_error(db, row.id, str(exc))
        raise HTTPException(400, str(exc)) from exc
    return ScheduleSyncResultOut(**result)


@router.delete("/subscription", response_model=ScheduleSubscriptionOut)
def delete_schedule_subscription(
    remove_future_tasks: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(ScheduleSubscription)
        .filter(ScheduleSubscription.user_id == current_user.id)
        .first()
    )
    if row is None:
        return ScheduleSubscriptionOut(connected=False)

    if remove_future_tasks:
        today = datetime.now(SAMARA_TZ).date()
        future_days = {
            item[0]
            for item in db.query(DayTask.day)
            .filter(
                DayTask.user_id == current_user.id,
                DayTask.schedule_subscription_id == row.id,
                DayTask.day > today,
            )
            .distinct()
            .all()
        }
        for target_day in future_days:
            if is_day_plan_protected(
                db,
                current_user.id,
                target_day,
                row.id,
                today=today,
            ):
                continue
            db.query(DayTask).filter(
                DayTask.user_id == current_user.id,
                DayTask.day == target_day,
                DayTask.schedule_subscription_id == row.id,
            ).delete(synchronize_session=False)

    # Оставшиеся пары становятся обычными задачами пользователя.
    db.query(DayTask).filter(
        DayTask.user_id == current_user.id,
        DayTask.schedule_subscription_id == row.id,
    ).update(
        {
            "schedule_subscription_id": None,
            "schedule_event_key": None,
            "schedule_lesson_type": None,
        },
        synchronize_session=False,
    )
    db.delete(row)
    db.commit()
    return ScheduleSubscriptionOut(connected=False)


@router.get("/week", response_model=ScheduleWeekOut)
def get_schedule_week(
    week_start: date = Query(...),
    lesson_type: str = Query("all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if lesson_type not in {"all", "lecture", "practice", "lab"}:
        raise HTTPException(400, "Неизвестный тип занятия")

    subscription = (
        db.query(ScheduleSubscription)
        .filter(ScheduleSubscription.user_id == current_user.id)
        .first()
    )
    if subscription is None:
        return ScheduleWeekOut(connected=False, events=[])

    week_end = week_start + timedelta(days=6)
    query = db.query(ScheduleEvent).filter(
        ScheduleEvent.subscription_id == subscription.id,
        ScheduleEvent.day >= week_start,
        ScheduleEvent.day <= week_end,
    )
    if lesson_type != "all":
        query = query.filter(ScheduleEvent.lesson_type == lesson_type)
    rows = query.order_by(ScheduleEvent.day, ScheduleEvent.start_time, ScheduleEvent.id).all()

    result: list[ScheduleEventOut] = []
    for row in rows:
        parsed = _event_from_row(row)
        if not event_matches_subgroup(parsed, subscription.subgroup):
            continue
        result.append(
            ScheduleEventOut(
                id=row.id,
                day=row.day,
                start_time=row.start_time.strftime("%H:%M"),
                end_time=row.end_time.strftime("%H:%M"),
                duration_min=row.duration_min,
                subject=row.subject,
                teacher=row.teacher,
                location=row.location,
                lesson_type=cast(Any, row.lesson_type),
                subgroup=row.subgroup,
                conference_url=row.conference_url,
            )
        )
    return ScheduleWeekOut(
        connected=True,
        subgroup=cast(Any, subscription.subgroup),
        events=result,
    )
