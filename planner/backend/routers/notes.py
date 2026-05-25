from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from dependencies import get_current_user, get_db
from db import DayNote, User
from schemas import DayNoteIn, DayNoteOut

router = APIRouter()


def _parse_date(day: str) -> date:
    try:
        return date.fromisoformat(day)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")


@router.get("/day-notes/{day}", response_model=DayNoteOut)
def get_day_note(
    day: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = _parse_date(day)
    note = db.query(DayNote).filter(DayNote.user_id == current_user.id, DayNote.day == d).first()
    return DayNoteOut(day=d, text=note.text if note else "")


@router.put("/day-notes/{day}", response_model=DayNoteOut)
def upsert_day_note(
    day: str,
    body: DayNoteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = _parse_date(day)
    note = db.query(DayNote).filter(DayNote.user_id == current_user.id, DayNote.day == d).first()
    if note:
        note.text = body.text
    else:
        note = DayNote(user_id=current_user.id, day=d, text=body.text)
        db.add(note)
    db.commit()
    db.refresh(note)
    return DayNoteOut(day=d, text=note.text)
