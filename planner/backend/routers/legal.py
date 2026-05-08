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
    TaskCategory,
    User,
    WeekTask,
    WeekTemplate,
)
from dependencies import get_current_developer, get_current_user, get_db
from schemas import *
from serializers import *

router = APIRouter()

@router.get("/legal/user-agreement", response_class=PlainTextResponse)
def get_user_agreement():
    path = DOCS_DIR / "user_agree.txt"
    if not path.exists():
        raise HTTPException(status_code=404, detail="user_agree.txt not found")
    return path.read_text(encoding="utf-8")


@router.get("/legal/personal-data-policy", response_class=PlainTextResponse)
def get_personal_data_policy():
    path = DOCS_DIR / "personal_data_policy.txt"
    if not path.exists():
        raise HTTPException(status_code=404, detail="personal_data_policy.txt not found")
    return path.read_text(encoding="utf-8")


@router.get("/legal/feedback-consent", response_class=PlainTextResponse)
def get_feedback_consent():
    path = DOCS_DIR / "rev_connect_form.txt"
    if not path.exists():
        raise HTTPException(status_code=404, detail="rev_connect_form.txt not found")
    return path.read_text(encoding="utf-8")
