from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta
from typing import Any, cast

from dotenv import load_dotenv
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db import TelegramLink, User
from dependencies import get_current_user, get_db

load_dotenv()

router = APIRouter()

LINK_CODE_TTL_MINUTES = 15
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "")


def _get_or_create_link(db: Session, user_id: int) -> TelegramLink:
    link = (
        db.query(TelegramLink).filter(TelegramLink.user_id == user_id).first()
    )
    if link is None:
        link = TelegramLink(user_id=user_id)
        db.add(link)
    return link


def _status_payload(link: TelegramLink | None) -> dict[str, Any]:
    linked = bool(link and link.chat_id)
    return {
        "linked": linked,
        "bot_username": TELEGRAM_BOT_USERNAME,
    }


@router.get("/telegram/status")
def telegram_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = cast(Any, current_user)
    link = db.query(TelegramLink).filter(TelegramLink.user_id == user.id).first()
    return _status_payload(link)


@router.post("/telegram/link-code")
def telegram_link_code(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Сгенерировать одноразовый код привязки и ссылку на бота."""
    user = cast(Any, current_user)
    link = _get_or_create_link(db, user.id)

    # 6-значный код, удобно ввести вручную при необходимости.
    code = f"{secrets.randbelow(1_000_000):06d}"
    link.link_code = code
    link.link_code_expires = datetime.utcnow() + timedelta(
        minutes=LINK_CODE_TTL_MINUTES
    )
    db.commit()

    deep_link = (
        f"https://t.me/{TELEGRAM_BOT_USERNAME}?start={code}"
        if TELEGRAM_BOT_USERNAME
        else None
    )

    return {
        "code": code,
        "deep_link": deep_link,
        "bot_username": TELEGRAM_BOT_USERNAME,
        "expires_in_minutes": LINK_CODE_TTL_MINUTES,
        "linked": bool(link.chat_id),
    }


@router.delete("/telegram/link")
def telegram_unlink(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = cast(Any, current_user)
    link = db.query(TelegramLink).filter(TelegramLink.user_id == user.id).first()
    if link:
        link.chat_id = None
        link.link_code = None
        link.link_code_expires = None
        link.linked_at = None
        db.commit()
    return {"ok": True}
