from __future__ import annotations


from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from bootstrap import DOCS_DIR
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
