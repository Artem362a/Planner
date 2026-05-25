from __future__ import annotations

from datetime import date, datetime, timedelta
from datetime import time as _time
from pathlib import Path
from uuid import uuid4
from typing import Any, List, cast

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, hash_password, verify_password
from bootstrap import DOCS_DIR, ensure_default_categories_for_user
from db import (
    DaySettings,
    DayTask,
    DayTemplate,
    FeedbackMessage,
    Goal,
    GoalCheckin,
    GoalStage,
    InboxTask,
    Notification,
    NotificationRecipient,
    TaskCategory,
    User,
    UserSession,
    WeekTask,
    WeekTemplate,
)
from dependencies import get_current_developer, get_current_user, get_db, security
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


def _create_session(
    db: Session,
    user_id: int,
    jti: str,
    request: Request,
) -> None:
    user_agent = request.headers.get("user-agent")
    ip = request.client.host if request.client else None
    db.add(
        UserSession(
            user_id=user_id,
            jti=jti,
            user_agent=user_agent,
            ip_address=ip,
        )
    )
    db.commit()


def _issue_token_with_session(
    db: Session,
    user_id: int,
    request: Request,
) -> str:
    token, jti = create_access_token({"sub": str(user_id)})
    _create_session(db, user_id, jti, request)
    return token


def _parse_hhmm(value: str) -> _time:
    raw = (value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Time is required")
    parts = raw.split(":")
    if len(parts) not in (2, 3):
        raise HTTPException(status_code=400, detail="Invalid time format")
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(parts[2]) if len(parts) == 3 else 0
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format")
    if not (0 <= hours <= 23 and 0 <= minutes <= 59 and 0 <= seconds <= 59):
        raise HTTPException(status_code=400, detail="Invalid time value")
    return _time(hours, minutes, seconds)


@router.post("/auth/register", response_model=TokenOut)
def register(
    body: UserRegisterIn,
    request: Request,
    db: Session = Depends(get_db),
):
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

    token = _issue_token_with_session(db, user_row.id, request)
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
def login(
    body: UserLoginIn,
    request: Request,
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    password = body.password.strip()

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_row = cast(Any, user)

    if not verify_password(password, str(user_row.password_hash)):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _issue_token_with_session(db, user_row.id, request)
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


@router.patch("/auth/theme", response_model=UserResponse)
def update_theme(
    body: UserThemeUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = cast(Any, current_user)
    row.theme = body.theme
    db.commit()
    db.refresh(current_user)
    return _user_to_out(current_user)


@router.patch("/auth/day-start", response_model=UserResponse)
def update_day_start(
    body: UserDayStartUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = cast(Any, current_user)
    row.default_day_start_time = _parse_hhmm(body.default_day_start_time)
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


# ---- Sessions ----

def _current_jti(request: Request) -> str | None:
    """Extract jti from the Bearer token on the request. Used to mark the
    current session in /auth/sessions and to skip the current session in
    'logout from all other devices'."""
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None
    from auth import decode_access_token

    token = auth_header.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if payload is None:
        return None
    return payload.get("jti")


@router.get("/auth/sessions", response_model=list[SessionOut])
def list_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_row = cast(Any, current_user)
    current_jti = _current_jti(request)

    # Purge sessions whose JWT has expired (older than token lifetime)
    cutoff = datetime.utcnow() - timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    db.query(UserSession).filter(
        UserSession.user_id == user_row.id,
        UserSession.created_at < cutoff,
    ).delete(synchronize_session=False)
    db.commit()

    rows = (
        db.query(UserSession)
        .filter(UserSession.user_id == user_row.id)
        .order_by(UserSession.last_seen_at.desc())
        .all()
    )

    out: list[SessionOut] = []
    for r in rows:
        row = cast(Any, r)
        out.append(
            SessionOut(
                id=row.id,
                user_agent=row.user_agent,
                ip_address=row.ip_address,
                created_at=row.created_at.isoformat(),
                last_seen_at=row.last_seen_at.isoformat(),
                is_current=(row.jti == current_jti),
            )
        )
    return out


@router.delete("/auth/sessions/{session_id}", response_model=MessageOut)
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_row = cast(Any, current_user)
    row = (
        db.query(UserSession)
        .filter(
            UserSession.id == session_id,
            UserSession.user_id == user_row.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(row)
    db.commit()
    return MessageOut(message="Session revoked")


@router.delete("/auth/sessions", response_model=MessageOut)
def revoke_all_other_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_row = cast(Any, current_user)
    current_jti = _current_jti(request)

    q = db.query(UserSession).filter(UserSession.user_id == user_row.id)
    if current_jti is not None:
        q = q.filter(UserSession.jti != current_jti)
    deleted = q.delete(synchronize_session=False)
    db.commit()
    return MessageOut(message=f"Revoked {deleted} session(s)")


# ---- Export & delete account ----

@router.get("/auth/export")
def export_account_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a JSON snapshot of all data belonging to the current user."""
    row = cast(Any, current_user)
    uid = row.id

    def _rows_as_dicts(query):
        out = []
        for obj in query:
            d: dict[str, Any] = {}
            for col in obj.__table__.columns:
                v = getattr(obj, col.name)
                if isinstance(v, (datetime, date, _time)):
                    d[col.name] = v.isoformat()
                else:
                    d[col.name] = v
            out.append(d)
        return out

    payload = {
        "exported_at": datetime.utcnow().isoformat(),
        "user": {
            "id": row.id,
            "email": row.email,
            "username": row.username,
            "role": row.role,
            "theme": row.theme,
            "default_day_start_time": row.default_day_start_time.strftime("%H:%M"),
        },
        "categories": _rows_as_dicts(
            db.query(TaskCategory).filter(TaskCategory.user_id == uid)
        ),
        "day_tasks": _rows_as_dicts(
            db.query(DayTask).filter(DayTask.user_id == uid)
        ),
        "day_settings": _rows_as_dicts(
            db.query(DaySettings).filter(DaySettings.user_id == uid)
        ),
        "day_templates": _rows_as_dicts(
            db.query(DayTemplate).filter(DayTemplate.user_id == uid)
        ),
        "week_tasks": _rows_as_dicts(
            db.query(WeekTask).filter(WeekTask.user_id == uid)
        ),
        "week_templates": _rows_as_dicts(
            db.query(WeekTemplate).filter(WeekTemplate.user_id == uid)
        ),
        "inbox_tasks": _rows_as_dicts(
            db.query(InboxTask).filter(InboxTask.user_id == uid)
        ),
        "goals": _rows_as_dicts(
            db.query(Goal).filter(Goal.user_id == uid)
        ),
        "goal_stages": _rows_as_dicts(
            db.query(GoalStage).join(Goal, Goal.id == GoalStage.goal_id).filter(Goal.user_id == uid)
        ),
        "goal_checkins": _rows_as_dicts(
            db.query(GoalCheckin).filter(GoalCheckin.user_id == uid)
        ),
        "notifications": _rows_as_dicts(
            db.query(NotificationRecipient).filter(NotificationRecipient.user_id == uid)
        ),
        "feedback_messages": _rows_as_dicts(
            db.query(FeedbackMessage).filter(FeedbackMessage.user_id == uid)
        ),
    }
    return payload


@router.delete("/auth/account", response_model=MessageOut)
def delete_account(
    body: AccountDeleteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hard-delete the user and all their data."""
    row = cast(Any, current_user)

    if not verify_password(body.password.strip(), str(row.password_hash)):
        raise HTTPException(status_code=400, detail="Password is incorrect")

    uid = row.id

    # Goal stages first (FK to goals), then goals; checkins are FK to goals too.
    goal_ids = [g.id for g in db.query(Goal.id).filter(Goal.user_id == uid).all()]
    if goal_ids:
        db.query(GoalStage).filter(GoalStage.goal_id.in_(goal_ids)).delete(synchronize_session=False)
        db.query(GoalCheckin).filter(GoalCheckin.goal_id.in_(goal_ids)).delete(synchronize_session=False)
        db.query(Goal).filter(Goal.id.in_(goal_ids)).delete(synchronize_session=False)

    # day_tasks references week_tasks; clear day_tasks first.
    db.query(DayTask).filter(DayTask.user_id == uid).delete(synchronize_session=False)
    db.query(WeekTask).filter(WeekTask.user_id == uid).delete(synchronize_session=False)
    db.query(DaySettings).filter(DaySettings.user_id == uid).delete(synchronize_session=False)
    db.query(DayTemplate).filter(DayTemplate.user_id == uid).delete(synchronize_session=False)
    db.query(WeekTemplate).filter(WeekTemplate.user_id == uid).delete(synchronize_session=False)
    db.query(InboxTask).filter(InboxTask.user_id == uid).delete(synchronize_session=False)
    db.query(TaskCategory).filter(TaskCategory.user_id == uid).delete(synchronize_session=False)

    # Notifications: recipient rows first; notifications authored by user lose their FK
    # (created_by_user_id is nullable), so we just null it.
    db.query(NotificationRecipient).filter(NotificationRecipient.user_id == uid).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.created_by_user_id == uid).update(
        {"created_by_user_id": None}, synchronize_session=False
    )

    db.query(FeedbackMessage).filter(FeedbackMessage.user_id == uid).update(
        {"user_id": None}, synchronize_session=False
    )

    # Sessions and the user itself.
    db.query(UserSession).filter(UserSession.user_id == uid).delete(synchronize_session=False)
    db.query(User).filter(User.id == uid).delete(synchronize_session=False)
    db.commit()
    return MessageOut(message="Account deleted")


# ---- Import schedule (СНИУ им. Королёва) — stub ----

@router.post("/auth/import-schedule", response_model=MessageOut)
def import_schedule_stub(
    current_user: User = Depends(get_current_user),
):
    """Stub for importing the university schedule. Implementation TBD."""
    raise HTTPException(
        status_code=501,
        detail="Импорт расписания пока не реализован. Скажи, в каком виде приходят данные.",
    )
