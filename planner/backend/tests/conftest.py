"""
Pytest fixtures.

We reuse the existing `dayplan` database but wrap every test in an outer
transaction that is rolled back at the end. Calls to `session.commit()` inside
the app code only release a SAVEPOINT, so nothing is ever persisted. The real
data in `dayplan` is untouched.

If TEST_DATABASE_URL is set in the environment, it overrides DATABASE_URL.
Otherwise we read from .env (i.e., the dev DB).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Optional override for a dedicated test DB.
if os.environ.get("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]

# Rate limiting off by default: fixtures hammer /auth/* far above the real
# limits. The dedicated rate-limit test re-enables the limiter at runtime.
os.environ.setdefault("RATE_LIMIT_ENABLED", "0")

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import pytest
from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# Bring the target DB (TEST_DATABASE_URL if set, else the dev DB) up to the
# latest schema before anything imports models against it. Idempotent.
alembic_command.upgrade(AlembicConfig(str(BACKEND_DIR / "alembic.ini")), "head")

from main import app  # noqa: E402
from auth import create_access_token, hash_password  # noqa: E402
from dependencies import get_db  # noqa: E402
from db import User, UserSession, engine  # noqa: E402


@pytest.fixture
def _txn():
    """Single connection with an outer transaction that is rolled back at
    the end of the test. Everything done inside — direct DB writes by the
    test or commits by the route handler — stays inside this transaction
    and never reaches disk."""
    connection = engine.connect()
    transaction = connection.begin()
    try:
        yield connection
    finally:
        transaction.rollback()
        connection.close()


@pytest.fixture
def db(_txn):
    """Session for the test body. Joined into the outer transaction via
    SAVEPOINT, so commit() inside the test releases a savepoint but never
    ends the outer transaction."""
    session = Session(bind=_txn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(_txn):
    """TestClient with get_db overridden to use the same transactional
    connection as the `db` fixture."""

    def override_get_db():
        session = Session(bind=_txn, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


# ---- User / auth helpers ----


def make_user(
    db,
    *,
    email: str = "alice@test.com",
    username: str = "alice",
    password: str = "password123",
    role: str = "user",
) -> User:
    user = User(
        email=email,
        username=username,
        password_hash=hash_password(password),
        email_verified=True,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_token_for(db, user: User) -> str:
    token, jti = create_access_token({"sub": str(user.id)})
    db.add(UserSession(user_id=user.id, jti=jti))
    db.commit()
    return token


@pytest.fixture
def user(db) -> User:
    return make_user(db)


@pytest.fixture
def auth_headers(db, user) -> dict[str, str]:
    token = make_token_for(db, user)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_user(db) -> User:
    return make_user(db, email="bob@test.com", username="bob")


@pytest.fixture
def other_auth_headers(db, other_user) -> dict[str, str]:
    token = make_token_for(db, other_user)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def developer(db) -> User:
    return make_user(db, email="dev@test.com", username="dev", role="developer")


@pytest.fixture
def developer_headers(db, developer) -> dict[str, str]:
    token = make_token_for(db, developer)
    return {"Authorization": f"Bearer {token}"}
