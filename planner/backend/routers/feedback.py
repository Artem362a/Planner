from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from db import FeedbackMessage, User
from dependencies import get_current_developer, get_current_user, get_db
from schemas import FeedbackOut, FeedbackReplyIn, FeedbackStatusUpdateIn

router = APIRouter()

FEEDBACK_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads" / "feedback"
FEEDBACK_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MAX_SCREENSHOTS = 5
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _serialize(row: Any) -> FeedbackOut:
    return FeedbackOut(
        id=row.id,
        category=row.category,
        type=row.feedback_type,
        name=row.name,
        contact=row.contact,
        message=row.message,
        created_at=row.created_at.isoformat(),
        status=row.status,
        developer_reply=row.developer_reply,
        developer_replied_at=(
            row.developer_replied_at.isoformat() if row.developer_replied_at else None
        ),
        screenshots=row.screenshots,
    )


@router.post("/feedback", response_model=FeedbackOut)
async def create_feedback(
    category: str = Form(...),
    type: str = Form(...),
    name: Optional[str] = Form(None),
    contact: Optional[str] = Form(None),
    message: str = Form(...),
    screenshots: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)

    message_text = message.strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Сообщение не может быть пустым")

    category_val = category.strip()
    type_val = type.strip()

    if not category_val:
        raise HTTPException(status_code=400, detail="Категория обязательна")
    if not type_val:
        raise HTTPException(status_code=400, detail="Тип обязателен")

    real_files = [f for f in screenshots if f.filename]

    if len(real_files) > MAX_SCREENSHOTS:
        raise HTTPException(
            status_code=400,
            detail=f"Максимум {MAX_SCREENSHOTS} скриншотов",
        )

    saved_paths: list[str] = []
    for file in real_files:
        if file.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Файл «{file.filename}» должен быть изображением (JPEG, PNG, WebP, GIF)",
            )

        content = await file.read()

        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Файл «{file.filename}» превышает 5 МБ",
            )

        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            ext = ".jpg"

        filename = f"{uuid.uuid4().hex}{ext}"
        (FEEDBACK_UPLOADS_DIR / filename).write_bytes(content)
        saved_paths.append(f"feedback/{filename}")

    row = FeedbackMessage(
        user_id=current_user_row.id,
        category=category_val,
        feedback_type=type_val,
        name=(name or "").strip() or None,
        contact=(contact or "").strip() or None,
        message=message_text,
        status="new",
        screenshots=saved_paths if saved_paths else None,
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return _serialize(cast(Any, row))


@router.get("/feedback", response_model=list[FeedbackOut])
def list_feedback(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_developer),
):
    rows = (
        db.query(FeedbackMessage)
        .order_by(FeedbackMessage.created_at.desc(), FeedbackMessage.id.desc())
        .all()
    )
    return [_serialize(cast(Any, r)) for r in rows]


@router.get("/feedback/my", response_model=list[FeedbackOut])
def list_my_feedback(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_row = cast(Any, current_user)
    rows = (
        db.query(FeedbackMessage)
        .filter(FeedbackMessage.user_id == current_user_row.id)
        .order_by(FeedbackMessage.created_at.desc(), FeedbackMessage.id.desc())
        .all()
    )
    return [_serialize(cast(Any, r)) for r in rows]


@router.patch("/feedback/{feedback_id}/reply", response_model=FeedbackOut)
def reply_to_feedback(
    feedback_id: int,
    body: FeedbackReplyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_developer),
):
    row = db.query(FeedbackMessage).filter(FeedbackMessage.id == feedback_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Feedback not found")

    feedback_row = cast(Any, row)
    reply_text = body.reply.strip()
    if not reply_text:
        raise HTTPException(status_code=400, detail="Reply is required")

    feedback_row.developer_reply = reply_text
    feedback_row.developer_replied_at = datetime.utcnow()
    if feedback_row.status == "new":
        feedback_row.status = "in_progress"

    db.commit()
    db.refresh(row)
    return _serialize(cast(Any, row))


@router.patch("/feedback/{feedback_id}", response_model=FeedbackOut)
def update_feedback_status(
    feedback_id: int,
    body: FeedbackStatusUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_developer),
):
    row = db.query(FeedbackMessage).filter(FeedbackMessage.id == feedback_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Feedback not found")

    feedback_row = cast(Any, row)
    feedback_row.status = body.status

    db.commit()
    db.refresh(row)
    return _serialize(cast(Any, row))
