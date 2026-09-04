from __future__ import annotations

from typing import Any, cast
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from db import (
    McpAllowlistEntry,
    McpAuditLog,
    McpOAuthAuthorizationCode,
    McpOAuthAuthorizationRequest,
    McpOAuthClient,
    McpOAuthGrant,
    User,
)
from dependencies import get_current_developer, get_current_user, get_db
from mcp_auth import (
    AUTHORIZATION_CODE_TTL,
    MCP_RESOURCE_URL,
    MCP_SCOPE_LABELS,
    generate_secret,
    hash_secret,
    is_mcp_allowed,
    normalize_scopes,
    revoke_grant,
    revoke_user_grants,
    utcnow,
)


router = APIRouter(prefix="/experimental", tags=["experimental"])


class AllowlistUpdateIn(BaseModel):
    enabled: bool


class OAuthDecisionIn(BaseModel):
    scopes: list[str] = []


def _redirect_with_query(uri: str, **params: str | None) -> str:
    parts = urlsplit(uri)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.update({key: value for key, value in params.items() if value is not None})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


@router.get("/mcp/status")
def get_mcp_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {
        "enabled": is_mcp_allowed(db, cast(Any, current_user).id),
        "resource_url": MCP_RESOURCE_URL,
        "access_token_minutes": 30,
    }


@router.get("/mcp/allowlist")
def list_mcp_allowlist(
    q: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_developer),
):
    query = db.query(User)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.filter(or_(User.email.ilike(pattern), User.username.ilike(pattern)))
    users = query.order_by(User.id.asc()).limit(250).all()
    user_ids = [cast(Any, user).id for user in users]

    entries = {
        cast(Any, row).user_id: bool(cast(Any, row).enabled)
        for row in db.query(McpAllowlistEntry)
        .filter(McpAllowlistEntry.user_id.in_(user_ids))
        .all()
    } if user_ids else {}
    connection_counts = {
        user_id: count
        for user_id, count in db.query(
            McpOAuthGrant.user_id,
            func.count(McpOAuthGrant.id),
        )
        .filter(
            McpOAuthGrant.user_id.in_(user_ids),
            McpOAuthGrant.revoked_at.is_(None),
        )
        .group_by(McpOAuthGrant.user_id)
        .all()
    } if user_ids else {}

    return [
        {
            "id": cast(Any, user).id,
            "email": cast(Any, user).email,
            "username": cast(Any, user).username,
            "role": cast(Any, user).role,
            "mcp_enabled": entries.get(cast(Any, user).id, False),
            "active_connections": int(connection_counts.get(cast(Any, user).id, 0)),
        }
        for user in users
    ]


@router.put("/mcp/allowlist/{user_id}")
def update_mcp_allowlist(
    user_id: int,
    body: AllowlistUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_developer),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    row = db.query(McpAllowlistEntry).filter(
        McpAllowlistEntry.user_id == user_id
    ).with_for_update().first()
    if row is None:
        row = McpAllowlistEntry(
            user_id=user_id,
            enabled=body.enabled,
            granted_by_user_id=cast(Any, current_user).id,
        )
        db.add(row)
    else:
        cast(Any, row).enabled = body.enabled
        cast(Any, row).granted_by_user_id = cast(Any, current_user).id
        cast(Any, row).updated_at = utcnow()

    if not body.enabled:
        revoke_user_grants(db, user_id)
    db.commit()
    return {"user_id": user_id, "mcp_enabled": body.enabled}


@router.get("/mcp/connections")
def list_my_mcp_connections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = cast(Any, current_user).id
    rows = (
        db.query(McpOAuthGrant, McpOAuthClient)
        .join(McpOAuthClient, McpOAuthClient.client_id == McpOAuthGrant.client_id)
        .filter(McpOAuthGrant.user_id == user_id)
        .order_by(McpOAuthGrant.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": grant.id,
            "client_name": client.client_name,
            "scopes": grant.scopes or [],
            "created_at": grant.created_at.isoformat(),
            "last_used_at": grant.last_used_at.isoformat() if grant.last_used_at else None,
            "revoked_at": grant.revoked_at.isoformat() if grant.revoked_at else None,
        }
        for grant, client in rows
    ]


@router.delete("/mcp/connections/{grant_id}")
def revoke_my_mcp_connection(
    grant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(McpOAuthGrant).filter(
        McpOAuthGrant.id == grant_id,
        McpOAuthGrant.user_id == cast(Any, current_user).id,
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="MCP connection not found")
    revoke_grant(db, row)
    db.commit()
    return {"ok": True}


def _load_pending_request(
    db: Session, request_id: str, *, for_update: bool = False
) -> McpOAuthAuthorizationRequest:
    query = db.query(McpOAuthAuthorizationRequest).filter(
        McpOAuthAuthorizationRequest.request_hash == hash_secret(request_id),
    )
    if for_update:
        query = query.with_for_update()
    row = query.first()
    if row is None or row.expires_at <= utcnow() or row.consumed_at is not None:
        raise HTTPException(status_code=400, detail="Authorization request expired or invalid")
    return row


@router.get("/mcp/oauth-requests/{request_id}")
def get_mcp_oauth_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = cast(Any, current_user).id
    if not is_mcp_allowed(db, user_id):
        raise HTTPException(status_code=403, detail="MCP access is not enabled for this account")
    row = _load_pending_request(db, request_id)
    client = db.query(McpOAuthClient).filter(McpOAuthClient.client_id == row.client_id).first()
    requested = list(cast(Any, row).scopes or [])
    if cast(Any, current_user).role != "developer":
        requested = [scope for scope in requested if scope != "feedback:read_all"]
    return {
        "client_name": cast(Any, client).client_name if client is not None else "MCP client",
        "resource": row.resource,
        "requested_scopes": requested,
        "scope_labels": {scope: MCP_SCOPE_LABELS[scope] for scope in requested},
        "expires_at": row.expires_at.isoformat(),
    }


@router.post("/mcp/oauth-requests/{request_id}/approve")
def approve_mcp_oauth_request(
    request_id: str,
    body: OAuthDecisionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = cast(Any, current_user).id
    if not is_mcp_allowed(db, user_id, for_update=True):
        raise HTTPException(status_code=403, detail="MCP access is not enabled for this account")
    row = _load_pending_request(db, request_id, for_update=True)
    requested = set(cast(Any, row).scopes or [])
    selected = set(body.scopes)
    if not selected.issubset(requested):
        raise HTTPException(status_code=400, detail="Unknown or unrequested scope")
    scopes = normalize_scopes(list(selected), current_user)

    code = generate_secret("mcp_code_")
    db.add(
        McpOAuthAuthorizationCode(
            code_hash=hash_secret(code),
            client_id=row.client_id,
            user_id=user_id,
            redirect_uri=row.redirect_uri,
            scopes=scopes,
            code_challenge=row.code_challenge,
            resource=row.resource,
            expires_at=utcnow() + AUTHORIZATION_CODE_TTL,
        )
    )
    row.consumed_at = utcnow()
    db.commit()
    return {"redirect_url": _redirect_with_query(row.redirect_uri, code=code, state=row.state)}


@router.post("/mcp/oauth-requests/{request_id}/deny")
def deny_mcp_oauth_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not is_mcp_allowed(db, cast(Any, current_user).id, for_update=True):
        raise HTTPException(status_code=403, detail="MCP access is not enabled for this account")
    row = _load_pending_request(db, request_id, for_update=True)
    row.consumed_at = utcnow()
    db.commit()
    return {
        "redirect_url": _redirect_with_query(
            row.redirect_uri,
            error="access_denied",
            error_description="The user denied the request",
            state=row.state,
        )
    }


@router.get("/mcp/audit")
def list_my_mcp_audit(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(McpAuditLog).filter(
        McpAuditLog.user_id == cast(Any, current_user).id,
    ).order_by(McpAuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": row.id,
            "tool_name": row.tool_name,
            "arguments": row.arguments,
            "success": row.success,
            "error": row.error,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]
