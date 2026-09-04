from __future__ import annotations

import secrets
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Form, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db import (
    McpOAuthAccessToken,
    McpOAuthAuthorizationCode,
    McpOAuthAuthorizationRequest,
    McpOAuthClient,
    McpOAuthGrant,
    McpOAuthRefreshToken,
)
from dependencies import get_db
from mcp_auth import (
    AUTHORIZATION_REQUEST_TTL,
    DEFAULT_SCOPES,
    MCP_RESOURCE_URL,
    MCP_SCOPES,
    OAUTH_ISSUER_URL,
    PUBLIC_API_URL,
    PUBLIC_APP_URL,
    generate_secret,
    hash_secret,
    is_mcp_allowed,
    is_mcp_resource_url,
    is_safe_redirect_uri,
    issue_tokens,
    pkce_s256,
    revoke_grant,
    utcnow,
)
from rate_limit import limiter


router = APIRouter(tags=["mcp-oauth"])


class OAuthClientRegistrationIn(BaseModel):
    client_name: str = Field(default="MCP client", min_length=1, max_length=120)
    redirect_uris: list[str] = Field(min_length=1, max_length=10)
    token_endpoint_auth_method: str = "none"
    grant_types: list[str] = ["authorization_code", "refresh_token"]
    response_types: list[str] = ["code"]


def _oauth_error(error: str, description: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        {"error": error, "error_description": description},
        status_code=status_code,
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )


@router.get("/.well-known/oauth-authorization-server")
def oauth_authorization_server_metadata():
    return {
        "issuer": OAUTH_ISSUER_URL,
        "authorization_endpoint": f"{PUBLIC_API_URL}/oauth/authorize",
        "token_endpoint": f"{PUBLIC_API_URL}/oauth/token",
        "registration_endpoint": f"{PUBLIC_API_URL}/oauth/register",
        "revocation_endpoint": f"{PUBLIC_API_URL}/oauth/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["none"],
        "code_challenge_methods_supported": ["S256"],
        "scopes_supported": sorted(MCP_SCOPES),
    }


@router.get("/.well-known/oauth-protected-resource/mcp")
def oauth_protected_resource_metadata():
    return {
        "resource": MCP_RESOURCE_URL,
        "authorization_servers": [OAUTH_ISSUER_URL],
        "scopes_supported": sorted(MCP_SCOPES),
        "bearer_methods_supported": ["header"],
        "resource_name": "Day Plan MCP",
    }


@router.post("/oauth/register", status_code=201)
@limiter.limit("30/hour")
def register_oauth_client(
    body: OAuthClientRegistrationIn,
    request: Request,
    db: Session = Depends(get_db),
):
    if body.token_endpoint_auth_method != "none":
        return _oauth_error("invalid_client_metadata", "Only public PKCE clients are supported")
    if "authorization_code" not in body.grant_types or "code" not in body.response_types:
        return _oauth_error("invalid_client_metadata", "authorization_code and code are required")
    redirect_uris = list(dict.fromkeys(uri.strip() for uri in body.redirect_uris))
    if not redirect_uris or any(not is_safe_redirect_uri(uri) for uri in redirect_uris):
        return _oauth_error(
            "invalid_redirect_uri",
            "Redirect URIs must use HTTPS, except http://localhost loopback callbacks",
        )

    client_id = generate_secret("mcp_client_")
    row = McpOAuthClient(
        client_id=client_id,
        client_name=body.client_name.strip(),
        redirect_uris=redirect_uris,
        token_endpoint_auth_method="none",
    )
    db.add(row)
    db.commit()
    return {
        "client_id": client_id,
        "client_id_issued_at": int(row.created_at.timestamp()),
        "client_name": row.client_name,
        "redirect_uris": redirect_uris,
        "token_endpoint_auth_method": "none",
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
    }


@router.get("/oauth/authorize")
@limiter.limit("60/hour")
def authorize_oauth_client(
    request: Request,
    response_type: str = Query(...),
    client_id: str = Query(..., min_length=1, max_length=300),
    redirect_uri: str = Query(..., min_length=1, max_length=2000),
    code_challenge: str = Query(..., min_length=43, max_length=128),
    code_challenge_method: str = Query(...),
    resource: str = Query(..., min_length=1, max_length=2000),
    scope: str | None = Query(None, max_length=1000),
    state: str | None = Query(None, max_length=1000),
    db: Session = Depends(get_db),
):
    client = db.query(McpOAuthClient).filter(McpOAuthClient.client_id == client_id).first()
    if client is None or redirect_uri not in (client.redirect_uris or []):
        return _oauth_error("invalid_client", "Unknown client or redirect URI", 400)

    def redirect_error(error: str, description: str):
        params = {"error": error, "error_description": description}
        if state is not None:
            params["state"] = state
        separator = "&" if "?" in redirect_uri else "?"
        return RedirectResponse(f"{redirect_uri}{separator}{urlencode(params)}", status_code=302)

    if response_type != "code":
        return redirect_error("unsupported_response_type", "Only response_type=code is supported")
    if code_challenge_method != "S256":
        return redirect_error("invalid_request", "PKCE with code_challenge_method=S256 is required")
    if not is_mcp_resource_url(resource):
        return redirect_error("invalid_target", "The token must target this MCP server")

    requested_scopes = set(scope.split()) if scope else set(DEFAULT_SCOPES)
    requested_scopes.add("planner:read")
    if not requested_scopes.issubset(MCP_SCOPES):
        return redirect_error("invalid_scope", "One or more requested scopes are unsupported")

    request_id = generate_secret("mcp_req_")
    db.add(
        McpOAuthAuthorizationRequest(
            request_hash=hash_secret(request_id),
            client_id=client_id,
            redirect_uri=redirect_uri,
            scopes=sorted(requested_scopes),
            state=state,
            code_challenge=code_challenge,
            code_challenge_method="S256",
            resource=MCP_RESOURCE_URL,
            expires_at=utcnow() + AUTHORIZATION_REQUEST_TTL,
        )
    )
    db.commit()
    consent_url = f"{PUBLIC_APP_URL}/oauth/consent?{urlencode({'request': request_id})}"
    return RedirectResponse(consent_url, status_code=302)


@router.post("/oauth/token")
@limiter.limit("120/hour")
def exchange_oauth_token(
    request: Request,
    grant_type: str = Form(...),
    client_id: str = Form(...),
    code: str | None = Form(None),
    redirect_uri: str | None = Form(None),
    code_verifier: str | None = Form(None),
    refresh_token: str | None = Form(None),
    resource: str | None = Form(None),
    db: Session = Depends(get_db),
):
    client = db.query(McpOAuthClient).filter(McpOAuthClient.client_id == client_id).first()
    if client is None:
        return _oauth_error("invalid_client", "Unknown OAuth client", 401)

    now = utcnow()
    if grant_type == "authorization_code":
        if not code or not redirect_uri or not code_verifier:
            return _oauth_error("invalid_request", "code, redirect_uri and code_verifier are required")
        row = db.query(McpOAuthAuthorizationCode).filter(
            McpOAuthAuthorizationCode.code_hash == hash_secret(code),
        ).first()
        if row is not None and not is_mcp_allowed(db, row.user_id, for_update=True):
            return _oauth_error("access_denied", "MCP access is no longer enabled", 403)
        if row is not None:
            row = db.query(McpOAuthAuthorizationCode).filter(
                McpOAuthAuthorizationCode.id == row.id,
            ).with_for_update().first()
        if (
            row is None
            or row.used_at is not None
            or row.expires_at <= now
            or row.client_id != client_id
            or row.redirect_uri != redirect_uri
            or not is_mcp_resource_url(row.resource)
            or (resource is not None and not is_mcp_resource_url(resource))
        ):
            return _oauth_error("invalid_grant", "Authorization code is invalid or expired")
        try:
            challenge = pkce_s256(code_verifier)
        except (UnicodeEncodeError, ValueError):
            return _oauth_error("invalid_grant", "Invalid PKCE verifier")
        if not secrets.compare_digest(challenge, row.code_challenge):
            return _oauth_error("invalid_grant", "PKCE verification failed")
        row.used_at = now
        grant = McpOAuthGrant(
            user_id=row.user_id,
            client_id=client_id,
            scopes=list(row.scopes or []),
            resource=MCP_RESOURCE_URL,
        )
        db.add(grant)
        db.flush()
        payload = issue_tokens(db, grant)
        db.commit()
        return JSONResponse(payload, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})

    if grant_type == "refresh_token":
        if not refresh_token:
            return _oauth_error("invalid_request", "refresh_token is required")
        row = db.query(McpOAuthRefreshToken).filter(
            McpOAuthRefreshToken.token_hash == hash_secret(refresh_token),
        ).first()
        if row is None:
            return _oauth_error("invalid_grant", "Refresh token is invalid")
        grant = db.query(McpOAuthGrant).filter(McpOAuthGrant.id == row.grant_id).first()
        if grant is not None and not is_mcp_allowed(db, grant.user_id, for_update=True):
            return _oauth_error("invalid_grant", "Refresh token is invalid or expired")
        if grant is not None:
            grant = db.query(McpOAuthGrant).filter(
                McpOAuthGrant.id == grant.id,
            ).with_for_update().first()
        row = db.query(McpOAuthRefreshToken).filter(
            McpOAuthRefreshToken.id == row.id,
        ).with_for_update().first()
        if row is None:
            return _oauth_error("invalid_grant", "Refresh token is invalid or expired")
        if row.revoked_at is not None:
            # Reuse of a rotated refresh token invalidates the whole connection.
            if row.replaced_by_id is not None and grant is not None:
                revoke_grant(db, grant, now=now)
                db.commit()
            return _oauth_error("invalid_grant", "Refresh token was already used or revoked")
        if (
            grant is None
            or grant.revoked_at is not None
            or grant.client_id != client_id
            or row.expires_at <= now
            or (resource is not None and not is_mcp_resource_url(resource))
        ):
            return _oauth_error("invalid_grant", "Refresh token is invalid or expired")

        row.revoked_at = now
        payload = issue_tokens(db, grant)
        db.flush()
        replacement = db.query(McpOAuthRefreshToken).filter(
            McpOAuthRefreshToken.token_hash == hash_secret(payload["refresh_token"]),
        ).first()
        row.replaced_by_id = replacement.id if replacement is not None else None
        grant.last_used_at = now
        db.commit()
        return JSONResponse(payload, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})

    return _oauth_error("unsupported_grant_type", "Unsupported grant_type")


@router.post("/oauth/revoke")
@limiter.limit("120/hour")
def revoke_oauth_token(
    request: Request,
    token: str = Form(...),
    client_id: str | None = Form(None),
    db: Session = Depends(get_db),
):
    token_hash = hash_secret(token)
    access = db.query(McpOAuthAccessToken).filter(McpOAuthAccessToken.token_hash == token_hash).first()
    refresh = db.query(McpOAuthRefreshToken).filter(McpOAuthRefreshToken.token_hash == token_hash).first()
    token_row: Any = access or refresh
    if token_row is not None:
        grant = db.query(McpOAuthGrant).filter(McpOAuthGrant.id == token_row.grant_id).first()
        if grant is not None and (client_id is None or grant.client_id == client_id):
            revoke_grant(db, grant)
            db.commit()
    # RFC 7009: revocation is intentionally successful for unknown tokens too.
    return JSONResponse({}, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})
