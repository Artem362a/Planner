from __future__ import annotations

from datetime import date, datetime, timedelta
from datetime import time as _time
from pathlib import Path
from uuid import uuid4
from typing import Any, List, cast

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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

AVATAR_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "avatars"
MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024
ALLOWED_AVATAR_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

@router.post("/auth/register", response_model=TokenOut)
def register(body: UserRegisterIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    username = body.username.strip()
    password = body.password.strip()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")

    existing_email = db.query(User).filter(User.email == email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    existing_username = db.query(User).filter(User.username == username).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        email=email,
        username=username,
        password_hash=hash_password(password),
        email_verified=True,
        verification_token=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    user_row = cast(Any, user)
    ensure_default_categories_for_user(db, user_row.id)

    token = create_access_token({"sub": str(user_row.id)})
    return TokenOut(access_token=token)

@router.get("/auth/verify-email", response_model=MessageOut)
def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verification_token == token).first()
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    user_row = cast(Any, user)
    user_row.email_verified = True
    user_row.verification_token = None

    db.commit()

    return MessageOut(message="Email verified successfully")

@router.post("/auth/login", response_model=TokenOut)
def login(body: UserLoginIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    password = body.password.strip()

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_row = cast(Any, user)

    if not verify_password(password, str(user_row.password_hash)):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user_row.id)})
    return TokenOut(access_token=token)
@router.get("/auth/me", response_model=UserResponse)
def auth_me(current_user: User = Depends(get_current_user)):
    return _user_to_out(current_user)


@router.patch("/auth/profile", response_model=UserResponse)
def update_profile(
    body: UserProfileUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)
    username = body.username.strip()

    if len(username) < 2:
        raise HTTPException(status_code=400, detail="Username is too short")

    existing_username = (
        db.query(User)
        .filter(
            User.username == username,
            User.id != current_user_row.id,
        )
        .first()
    )
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    avatar = (body.avatar or "").strip() or None
    if avatar is not None and len(avatar) > 3_000_000:
        raise HTTPException(status_code=400, detail="Avatar image is too large")

    current_user_row.username = username
    current_user_row.avatar = avatar

    db.commit()
    db.refresh(current_user)

    return _user_to_out(current_user)


@router.post("/auth/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)
    content_type = (file.content_type or "").lower()

    if content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported avatar image type")

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Avatar image is too large")

    AVATAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Delete the previous avatar file if it exists
    old_avatar: str = current_user_row.avatar or ""
    if old_avatar.startswith("/uploads/avatars/"):
        old_path = AVATAR_UPLOAD_DIR / Path(old_avatar).name
        old_path.unlink(missing_ok=True)

    suffix = ALLOWED_AVATAR_TYPES[content_type]
    filename = f"user_{current_user_row.id}_{uuid4().hex}{suffix}"
    avatar_path = AVATAR_UPLOAD_DIR / filename
    avatar_path.write_bytes(content)

    current_user_row.avatar = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(current_user)

    return _user_to_out(current_user)


@router.patch("/auth/password", response_model=MessageOut)
def update_password(
    body: UserPasswordUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)
    current_password = body.current_password.strip()
    new_password = body.new_password.strip()

    if not verify_password(current_password, str(current_user_row.password_hash)):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password is too short")

    current_user_row.password_hash = hash_password(new_password)
    db.commit()

    return MessageOut(message="Password updated successfully")
