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
    Reminder,
    TaskCategory,
    User,
    WeekTask,
    WeekTemplate,
)
from dependencies import get_current_developer, get_current_user, get_db
from reminder_rules import RECUR_EVERY_MAX, RECUR_UNITS, reschedule_recurring
from schemas import *
from serializers import *

router = APIRouter()


def _reminder_to_out(row: Any) -> ReminderOut:
    return ReminderOut(
        id=row.id,
        text=row.text,
        remind_at=row.remind_at.strftime("%Y-%m-%dT%H:%M"),
        sent=bool(row.sent),
        kind=getattr(row, "kind", "manual") or "manual",
        recur_every=getattr(row, "recur_every", None),
        recur_unit=getattr(row, "recur_unit", None),
        ack=getattr(row, "ack", None),
    )

@router.get("/notifications/users", response_model=list[UserShortOut])
def list_users_for_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_developer),
):
    rows = (
        db.query(User)
        .order_by(User.username.asc(), User.email.asc())
        .all()
    )

    result: list[UserShortOut] = []

    for row in rows:
        user_row = cast(Any, row)
        result.append(
            UserShortOut(
                id=user_row.id,
                email=user_row.email,
                username=user_row.username,
                role=user_row.role,
            )
        )

    return result

@router.get("/notifications/unread-count", response_model=NotificationCountOut)
def get_unread_notifications_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    unread_count = (
        db.query(NotificationRecipient)
        .filter(
            NotificationRecipient.user_id == current_user_row.id,
            NotificationRecipient.is_read == False,  # noqa: E712
        )
        .count()
    )

    return NotificationCountOut(unread_count=unread_count)

@router.patch("/notifications/{notification_id}/read", response_model=MessageOut)
def mark_notification_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    row = (
        db.query(NotificationRecipient)
        .filter(
            NotificationRecipient.notification_id == notification_id,
            NotificationRecipient.user_id == current_user_row.id,
        )
        .first()
    )

    if row is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    recipient_row = cast(Any, row)
    recipient_row.is_read = True
    recipient_row.read_at = datetime.utcnow()

    db.commit()

    return MessageOut(message="Notification marked as read")

@router.patch("/notifications/read-all", response_model=MessageOut)
def mark_all_notifications_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    rows = (
        db.query(NotificationRecipient)
        .filter(
            NotificationRecipient.user_id == current_user_row.id,
            NotificationRecipient.is_read == False,  # noqa: E712
        )
        .all()
    )

    for row in rows:
        recipient_row = cast(Any, row)
        recipient_row.is_read = True
        recipient_row.read_at = datetime.utcnow()

    db.commit()

    return MessageOut(message="All notifications marked as read")



@router.post("/notifications/send", response_model=MessageOut)
def send_notification(
    body: NotificationCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_developer),
):
    current_user_row = cast(Any, current_user)

    title = body.title.strip()
    message = body.message.strip()

    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    user_ids: list[int] = []

    if body.audience_type == "all":
        users = db.query(User).all()
        user_ids = [cast(Any, user).id for user in users]

    elif body.audience_type == "single":
        if len(body.user_ids) != 1:
            raise HTTPException(
                status_code=400,
                detail="Single notification requires exactly one user_id",
            )
        user_ids = body.user_ids

    elif body.audience_type == "group":
        if len(body.user_ids) == 0:
            raise HTTPException(
                status_code=400,
                detail="Group notification requires at least one user_id",
            )
        user_ids = list(set(body.user_ids))

    else:
        raise HTTPException(status_code=400, detail="Invalid audience_type")

    existing_users = (
        db.query(User)
        .filter(User.id.in_(user_ids))
        .all()
    )
    existing_user_ids = {cast(Any, user).id for user in existing_users}

    if set(user_ids) != existing_user_ids:
        raise HTTPException(status_code=400, detail="Some users were not found")

    notification = Notification(
        title=title,
        message=message,
        created_by_user_id=current_user_row.id,
        audience_type=body.audience_type,
    )
    db.add(notification)
    db.flush()

    for user_id in user_ids:
        db.add(
            NotificationRecipient(
                notification_id=notification.id,
                user_id=user_id,
                is_read=False,
            )
        )

    db.commit()

    return MessageOut(message="Notification sent")

@router.post("/notifications/overdue-reminder")
def create_overdue_reminder(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создаёт или обновляет сегодняшнее уведомление о просроченных задачах."""
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    current_user_row = cast(Any, current_user)

    count = (
        db.query(DayTask)
        .filter(
            DayTask.user_id == current_user_row.id,
            DayTask.day < today,
            DayTask.status == 0,
            DayTask.dismissed.isnot(True),
        )
        .count()
    )

    if count == 0:
        return {"created": False, "count": 0}

    def _pluralize(n: int) -> str:
        if 11 <= n % 100 <= 19:
            return "задач"
        r = n % 10
        if r == 1:
            return "задача"
        if 2 <= r <= 4:
            return "задачи"
        return "задач"

    message = f"У вас {count} просроченных {_pluralize(count)}. Откройте план на день, чтобы перенести или игнорировать их."

    # Все существующие уведомления этого типа за сегодня для этого пользователя
    today_notifs = (
        db.query(Notification)
        .join(NotificationRecipient, NotificationRecipient.notification_id == Notification.id)
        .filter(
            NotificationRecipient.user_id == current_user_row.id,
            Notification.title == "Просроченные задачи",
            Notification.created_at >= today_start,
        )
        .order_by(Notification.created_at.asc())
        .all()
    )

    if today_notifs:
        # Обновляем самое первое, остальные удаляем (вместе с их recipients по cascade)
        first = cast(Any, today_notifs[0])
        first.message = message

        first_recipient = (
            db.query(NotificationRecipient)
            .filter(
                NotificationRecipient.notification_id == first.id,
                NotificationRecipient.user_id == current_user_row.id,
            )
            .first()
        )
        if first_recipient is not None:
            cast(Any, first_recipient).is_read = False

        for dup in today_notifs[1:]:
            db.delete(dup)

        db.commit()
        return {"created": False, "updated": True, "count": count}

    notification = Notification(
        title="Просроченные задачи",
        message=message,
        created_by_user_id=current_user_row.id,
        audience_type="single",
    )
    db.add(notification)
    db.flush()

    db.add(NotificationRecipient(
        notification_id=cast(Any, notification).id,
        user_id=current_user_row.id,
        is_read=False,
    ))
    db.commit()

    return {"created": True, "count": count}


@router.delete("/notifications/{notification_id}", response_model=MessageOut)
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    row = (
        db.query(NotificationRecipient)
        .filter(
            NotificationRecipient.notification_id == notification_id,
            NotificationRecipient.user_id == current_user_row.id,
        )
        .first()
    )

    if row is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(row)
    db.commit()

    return MessageOut(message="Notification deleted")


# ---------------------------------------------------------------- reminders


@router.get("/reminders", response_model=list[ReminderOut])
def list_reminders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ожидающие (ещё не отправленные) напоминания пользователя."""
    current_user_row = cast(Any, current_user)

    rows = (
        db.query(Reminder)
        .filter(
            Reminder.user_id == current_user_row.id,
            Reminder.sent == False,  # noqa: E712
        )
        .order_by(Reminder.remind_at.asc(), Reminder.id.asc())
        .all()
    )

    return [_reminder_to_out(cast(Any, r)) for r in rows]


@router.post("/reminders", response_model=ReminderOut)
def create_reminder(
    body: ReminderIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        remind_at = datetime.fromisoformat(body.remind_at)
    except ValueError:
        raise HTTPException(status_code=400, detail="Bad remind_at, use YYYY-MM-DDTHH:MM")
    # Секунды/таймзону отбрасываем: храним наивные минуты локального времени.
    remind_at = remind_at.replace(second=0, microsecond=0, tzinfo=None)

    if remind_at <= datetime.now():
        raise HTTPException(status_code=400, detail="Время напоминания уже прошло")

    if (body.recur_every is None) != (body.recur_unit is None):
        raise HTTPException(status_code=400, detail="recur_every и recur_unit задаются вместе")
    if body.recur_every is not None:
        if body.recur_unit not in RECUR_UNITS:
            raise HTTPException(status_code=400, detail="recur_unit must be day|week|month")
        if not (1 <= body.recur_every <= RECUR_EVERY_MAX):
            raise HTTPException(status_code=400, detail=f"recur_every must be 1..{RECUR_EVERY_MAX}")

    row = Reminder(
        user_id=current_user_row.id,
        text=text,
        remind_at=remind_at,
        recur_every=body.recur_every,
        recur_unit=body.recur_unit,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return _reminder_to_out(cast(Any, row))


@router.post("/reminders/{reminder_id}/snooze", response_model=ReminderOut)
def snooze_reminder(
    reminder_id: int,
    body: ReminderSnoozeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Отложить напоминание на `minutes` минут.

    База отсчёта — max(сейчас, remind_at): уже сработавшее откладывается
    «от сейчас», ещё не сработавшее — переносится позже запланированного.
    Сброс `sent` возвращает сработавшее напоминание в очередь доставки.
    """
    current_user_row = cast(Any, current_user)

    if not (1 <= body.minutes <= 7 * 24 * 60):
        raise HTTPException(status_code=400, detail="minutes must be 1..10080")

    row = (
        db.query(Reminder)
        .filter(
            Reminder.id == reminder_id,
            Reminder.user_id == current_user_row.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    row_cast = cast(Any, row)
    now = datetime.now().replace(second=0, microsecond=0)
    base = max(now, row_cast.remind_at)
    row_cast.remind_at = base + timedelta(minutes=body.minutes)
    row_cast.sent = False
    row_cast.sent_at = None
    row_cast.ack = None
    row_cast.ack_at = None
    row_cast.repeat_count = 0
    db.commit()
    db.refresh(row)

    return _reminder_to_out(row_cast)


@router.post("/reminders/{reminder_id}/ack", response_model=ReminderOut)
def ack_reminder(
    reminder_id: int,
    body: ReminderAckIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ответ на сработавшее напоминание: «сделано» или «прочитано».

    Оба ответа останавливают повторную доставку. «Сделано» у напоминания-от-задачи
    дополнительно отмечает задачу выполненной. Повторяющееся напоминание после
    любого ответа перепланируется на следующее срабатывание.
    """
    current_user_row = cast(Any, current_user)

    row = (
        db.query(Reminder)
        .filter(
            Reminder.id == reminder_id,
            Reminder.user_id == current_user_row.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    row_cast = cast(Any, row)
    if not row_cast.sent:
        raise HTTPException(status_code=400, detail="Reminder has not fired yet")

    now = datetime.now()

    if body.status == "done" and row_cast.source_task_id is not None:
        task = (
            db.query(DayTask)
            .filter(
                DayTask.id == row_cast.source_task_id,
                DayTask.user_id == current_user_row.id,
            )
            .first()
        )
        if task is not None:
            cast(Any, task).status = 1

    if row_cast.recur_every:
        reschedule_recurring(row_cast, now)
    else:
        row_cast.ack = body.status
        row_cast.ack_at = now

    db.commit()
    db.refresh(row)

    return _reminder_to_out(row_cast)


@router.delete("/reminders/{reminder_id}", response_model=MessageOut)
def delete_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    row = (
        db.query(Reminder)
        .filter(
            Reminder.id == reminder_id,
            Reminder.user_id == current_user_row.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    db.delete(row)
    db.commit()

    return MessageOut(message="Reminder deleted")


@router.get("/notifications", response_model=list[NotificationOut])
def list_my_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    rows = (
        db.query(NotificationRecipient)
        .join(Notification, Notification.id == NotificationRecipient.notification_id)
        .filter(NotificationRecipient.user_id == current_user_row.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .all()
    )

    result: list[NotificationOut] = []

    for row in rows:
        recipient_row = cast(Any, row)
        notification_row = cast(Any, recipient_row.notification)

        result.append(
            NotificationOut(
                id=notification_row.id,
                title=notification_row.title,
                message=notification_row.message,
                created_at=notification_row.created_at.isoformat(),
                is_read=bool(recipient_row.is_read),
            )
        )

    return result
