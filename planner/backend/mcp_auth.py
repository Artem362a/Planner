"""OAuth and authorization helpers for the experimental MCP integration.

All issued credentials are opaque, high-entropy values.  Only keyed hashes are
stored in PostgreSQL, so a database read alone does not reveal usable tokens.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from db import (
    McpAllowlistEntry,
    McpOAuthAccessToken,
    McpOAuthGrant,
    McpOAuthRefreshToken,
    User,
)


ACCESS_TOKEN_TTL = timedelta(minutes=30)
REFRESH_TOKEN_TTL = timedelta(days=30)
AUTHORIZATION_REQUEST_TTL = timedelta(minutes=10)
AUTHORIZATION_CODE_TTL = timedelta(minutes=5)

PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", os.getenv("FRONTEND_URL", "http://localhost:5173")).rstrip("/")
_public_app_host = urlparse(PUBLIC_APP_URL).hostname
_loopback_app = _public_app_host in {"localhost", "127.0.0.1", "::1"}
_default_api_url = "http://localhost:8000" if _loopback_app else f"{PUBLIC_APP_URL}/api"
_default_mcp_url = f"{_default_api_url}/mcp" if _loopback_app else f"{PUBLIC_APP_URL}/mcp"
_default_issuer_url = _default_api_url if _loopback_app else PUBLIC_APP_URL
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", _default_api_url).rstrip("/")
MCP_RESOURCE_URL = os.getenv("MCP_RESOURCE_URL", _default_mcp_url).rstrip("/")
OAUTH_ISSUER_URL = os.getenv("OAUTH_ISSUER_URL", _default_issuer_url).rstrip("/")

# Scopes are deliberately about planner capabilities, never about raw REST
# endpoints.  Security/account/Telegram/admin-write operations are absent.
MCP_SCOPE_LABELS: dict[str, str] = {
    "planner:read": "Чтение планов, целей, заметок, напоминаний и статистики",
    "tasks:create": "Создание дневных, недельных и входящих задач",
    "tasks:edit": "Редактирование, завершение, перенос и упорядочивание задач",
    "tasks:delete": "Удаление задач",
    "goals:create": "Создание целей и этапов",
    "goals:edit": "Редактирование целей, этапов и отметок прогресса",
    "goals:delete": "Удаление целей и этапов",
    "organizer:edit": "Редактирование заметок, категорий, шаблонов и напоминаний",
    "organizer:delete": "Удаление категорий, шаблонов и напоминаний",
    "schedule:read": "Чтение расписания занятий",
    "feedback:read_all": "Чтение отзывов всех пользователей (только developer)",
}
MCP_SCOPES = frozenset(MCP_SCOPE_LABELS)
DEFAULT_SCOPES = frozenset(
    {
        "planner:read",
        "tasks:create",
        "tasks:edit",
        "goals:create",
        "goals:edit",
        "organizer:edit",
        "schedule:read",
    }
)


def utcnow() -> datetime:
    return datetime.utcnow()


def _token_pepper() -> bytes:
    value = os.getenv("MCP_TOKEN_PEPPER") or os.getenv("SECRET_KEY")
    if not value:
        raise RuntimeError("MCP_TOKEN_PEPPER or SECRET_KEY must be configured")
    return value.encode("utf-8")


def hash_secret(value: str) -> str:
    return hmac.new(_token_pepper(), value.encode("utf-8"), hashlib.sha256).hexdigest()


def generate_secret(prefix: str) -> str:
    return f"{prefix}{secrets.token_urlsafe(32)}"


def pkce_s256(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def is_safe_redirect_uri(uri: str) -> bool:
    """OAuth redirect URIs must be HTTPS, except loopback development clients."""
    try:
        parsed = urlparse(uri)
    except ValueError:
        return False
    if parsed.fragment or not parsed.scheme or not parsed.netloc:
        return False
    if parsed.scheme == "https":
        return True
    return parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}


def is_mcp_allowed(db: Session, user_id: int, *, for_update: bool = False) -> bool:
    query = db.query(McpAllowlistEntry).filter(
        McpAllowlistEntry.user_id == user_id,
        McpAllowlistEntry.enabled == True,  # noqa: E712
    )
    if for_update:
        query = query.with_for_update()
    return query.first() is not None


def normalize_scopes(values: list[str] | set[str] | tuple[str, ...], user: User) -> list[str]:
    scopes = {str(value).strip() for value in values if str(value).strip() in MCP_SCOPES}
    if getattr(user, "role", "user") != "developer":
        scopes.discard("feedback:read_all")
    scopes.add("planner:read")
    return sorted(scopes)


def issue_tokens(db: Session, grant: McpOAuthGrant) -> dict[str, Any]:
    access_secret = generate_secret("mcp_at_")
    refresh_secret = generate_secret("mcp_rt_")
    now = utcnow()
    db.add(
        McpOAuthAccessToken(
            grant_id=grant.id,
            token_hash=hash_secret(access_secret),
            expires_at=now + ACCESS_TOKEN_TTL,
        )
    )
    refresh_row = McpOAuthRefreshToken(
        grant_id=grant.id,
        token_hash=hash_secret(refresh_secret),
        expires_at=now + REFRESH_TOKEN_TTL,
    )
    db.add(refresh_row)
    db.flush()
    return {
        "access_token": access_secret,
        "token_type": "Bearer",
        "expires_in": int(ACCESS_TOKEN_TTL.total_seconds()),
        "refresh_token": refresh_secret,
        "scope": " ".join(grant.scopes or []),
    }


def revoke_grant(db: Session, grant: McpOAuthGrant, *, now: datetime | None = None) -> None:
    moment = now or utcnow()
    if grant.revoked_at is None:
        grant.revoked_at = moment
    db.query(McpOAuthAccessToken).filter(
        McpOAuthAccessToken.grant_id == grant.id,
        McpOAuthAccessToken.revoked_at.is_(None),
    ).update({"revoked_at": moment}, synchronize_session=False)
    db.query(McpOAuthRefreshToken).filter(
        McpOAuthRefreshToken.grant_id == grant.id,
        McpOAuthRefreshToken.revoked_at.is_(None),
    ).update({"revoked_at": moment}, synchronize_session=False)


def revoke_user_grants(db: Session, user_id: int) -> None:
    now = utcnow()
    grants = db.query(McpOAuthGrant).filter(
        McpOAuthGrant.user_id == user_id,
        McpOAuthGrant.revoked_at.is_(None),
    ).all()
    for grant in grants:
        revoke_grant(db, grant, now=now)
