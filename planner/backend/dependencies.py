from __future__ import annotations

from typing import Any, cast

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from auth import decode_access_token
from db import SessionLocal, User

security = HTTPBearer(auto_error=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    return user


def get_current_developer(
    current_user: User = Depends(get_current_user),
) -> User:
    user_row = cast(Any, current_user)

    if user_row.role != "developer":
        raise HTTPException(status_code=403, detail="Developer access required")

    return current_user
