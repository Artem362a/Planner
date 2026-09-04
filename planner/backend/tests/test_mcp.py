from __future__ import annotations

import asyncio
from datetime import date
from urllib.parse import parse_qs, urlparse

import pytest
from mcp.server.auth.provider import AccessToken
from mcp.server.fastmcp.exceptions import ToolError
from sqlalchemy.orm import Session

import mcp_server
from db import (
    DayTask,
    McpAllowlistEntry,
    McpOAuthAccessToken,
    McpOAuthClient,
    McpOAuthGrant,
    McpOAuthRefreshToken,
)
from mcp_auth import MCP_RESOURCE_URL, issue_tokens, pkce_s256


def _allow(db, user, developer=None):
    db.add(
        McpAllowlistEntry(
            user_id=user.id,
            enabled=True,
            granted_by_user_id=developer.id if developer else None,
        )
    )
    db.commit()


def test_mcp_metadata_and_redirect_use_canonical_resource(client):
    for discovery_path in (
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-protected-resource/mcp/",
    ):
        metadata = client.get(discovery_path)
        assert metadata.status_code == 200
        assert metadata.headers["content-type"].startswith("application/json")
        assert metadata.json()["resource"] == MCP_RESOURCE_URL
    assert MCP_RESOURCE_URL.endswith("/mcp/")

    redirect = client.post("/mcp", follow_redirects=False)
    assert redirect.status_code == 308
    assert redirect.headers["location"] == MCP_RESOURCE_URL


def test_allowlist_is_developer_managed_and_disable_revokes_grants(
    client, db, user, auth_headers, developer, developer_headers
):
    forbidden = client.get("/experimental/mcp/allowlist", headers=auth_headers)
    assert forbidden.status_code == 403

    enabled = client.put(
        f"/experimental/mcp/allowlist/{user.id}",
        headers=developer_headers,
        json={"enabled": True},
    )
    assert enabled.status_code == 200
    assert enabled.json() == {"user_id": user.id, "mcp_enabled": True}

    oauth_client = McpOAuthClient(
        client_id="test-client",
        client_name="Test client",
        redirect_uris=["http://127.0.0.1:8765/callback"],
        token_endpoint_auth_method="none",
    )
    db.add(oauth_client)
    db.flush()
    grant = McpOAuthGrant(
        user_id=user.id,
        client_id=oauth_client.client_id,
        scopes=["planner:read"],
        resource=MCP_RESOURCE_URL,
    )
    db.add(grant)
    db.flush()
    issue_tokens(db, grant)
    db.commit()

    status = client.get("/experimental/mcp/status", headers=auth_headers)
    assert status.status_code == 200
    assert status.json()["enabled"] is True
    assert status.json()["access_token_minutes"] == 30

    disabled = client.put(
        f"/experimental/mcp/allowlist/{user.id}",
        headers=developer_headers,
        json={"enabled": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["mcp_enabled"] is False
    db.expire_all()
    persisted_grant = db.query(McpOAuthGrant).filter(McpOAuthGrant.id == grant.id).one()
    assert persisted_grant.revoked_at is not None
    assert db.query(McpOAuthAccessToken).filter(
        McpOAuthAccessToken.grant_id == grant.id,
        McpOAuthAccessToken.revoked_at.is_(None),
    ).count() == 0
    assert db.query(McpOAuthRefreshToken).filter(
        McpOAuthRefreshToken.grant_id == grant.id,
        McpOAuthRefreshToken.revoked_at.is_(None),
    ).count() == 0


def test_oauth_pkce_flow_refresh_rotation_and_reuse_detection(
    client, db, user, auth_headers, developer
):
    _allow(db, user, developer)
    registration = client.post(
        "/oauth/register",
        json={
            "client_name": "Test MCP client",
            "redirect_uris": ["http://127.0.0.1:8765/callback"],
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
        },
    )
    assert registration.status_code == 201
    client_id = registration.json()["client_id"]

    verifier = "v" * 64
    authorization = client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": "http://127.0.0.1:8765/callback",
            "code_challenge": pkce_s256(verifier),
            "code_challenge_method": "S256",
            # Slashless is the resource identifier published before the
            # canonical redirect fix and remains accepted for compatibility.
            "resource": MCP_RESOURCE_URL.rstrip("/"),
            "scope": "planner:read tasks:create tasks:edit tasks:delete feedback:read_all",
            "state": "csrf-state",
        },
        follow_redirects=False,
    )
    assert authorization.status_code == 302
    request_id = parse_qs(urlparse(authorization.headers["location"]).query)["request"][0]

    details = client.get(
        f"/experimental/mcp/oauth-requests/{request_id}", headers=auth_headers
    )
    assert details.status_code == 200
    assert details.json()["client_name"] == "Test MCP client"
    assert "feedback:read_all" not in details.json()["requested_scopes"]

    approved = client.post(
        f"/experimental/mcp/oauth-requests/{request_id}/approve",
        headers=auth_headers,
        json={"scopes": ["planner:read", "tasks:create", "tasks:edit"]},
    )
    assert approved.status_code == 200
    callback = urlparse(approved.json()["redirect_url"])
    callback_query = parse_qs(callback.query)
    assert callback_query["state"] == ["csrf-state"]
    code = callback_query["code"][0]

    exchanged = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": client_id,
            "code": code,
            "redirect_uri": "http://127.0.0.1:8765/callback",
            "code_verifier": verifier,
            "resource": MCP_RESOURCE_URL.rstrip("/"),
        },
    )
    assert exchanged.status_code == 200
    first_tokens = exchanged.json()
    assert first_tokens["expires_in"] == 1800
    assert "tasks:delete" not in first_tokens["scope"]

    refreshed = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": client_id,
            "refresh_token": first_tokens["refresh_token"],
            "resource": MCP_RESOURCE_URL.rstrip("/"),
        },
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["refresh_token"] != first_tokens["refresh_token"]

    reused = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": client_id,
            "refresh_token": first_tokens["refresh_token"],
            "resource": MCP_RESOURCE_URL,
        },
    )
    assert reused.status_code == 400
    grant = db.query(McpOAuthGrant).filter(McpOAuthGrant.client_id == client_id).one()
    assert grant.revoked_at is not None
    rotated = db.query(McpOAuthRefreshToken).filter(
        McpOAuthRefreshToken.grant_id == grant.id,
        McpOAuthRefreshToken.replaced_by_id.is_(None),
    ).order_by(McpOAuthRefreshToken.id.desc()).first()
    assert rotated is not None


def test_mcp_tools_cannot_read_or_delete_another_users_task(
    monkeypatch, _txn, db, user, other_user
):
    _allow(db, user)
    own_task = DayTask(
        user_id=user.id,
        day=date(2026, 9, 5),
        title="Own task",
        priority="medium",
        status=0,
        subtasks=[],
        order_index=0,
    )
    other_task = DayTask(
        user_id=other_user.id,
        day=date(2026, 9, 5),
        title="Other user's secret task",
        priority="medium",
        status=0,
        subtasks=[],
        order_index=0,
    )
    db.add_all([own_task, other_task])
    db.commit()

    access = AccessToken(
        token="test",
        client_id="test-client",
        scopes=["planner:read", "tasks:delete"],
        subject=str(user.id),
        resource=MCP_RESOURCE_URL,
        claims={"grant_id": 0},
    )
    monkeypatch.setattr(mcp_server, "get_access_token", lambda: access)
    monkeypatch.setattr(
        mcp_server,
        "SessionLocal",
        lambda: Session(bind=_txn, join_transaction_mode="create_savepoint"),
    )

    visible = mcp_server.get_day_plan("2026-09-05")
    assert [item["title"] for item in visible] == ["Own task"]

    with pytest.raises(ToolError, match="Task not found"):
        mcp_server.delete_day_task("2026-09-05", other_task.id)

    db.expire_all()
    assert db.query(DayTask).filter(DayTask.id == other_task.id).one().title == "Other user's secret task"


def test_token_verifier_rejects_user_removed_from_allowlist(
    monkeypatch, _txn, db, user
):
    _allow(db, user)
    oauth_client = McpOAuthClient(
        client_id="verifier-client",
        client_name="Verifier client",
        redirect_uris=["http://127.0.0.1:8765/callback"],
        token_endpoint_auth_method="none",
    )
    grant = McpOAuthGrant(
        user_id=user.id,
        client_id=oauth_client.client_id,
        scopes=["planner:read"],
        resource=MCP_RESOURCE_URL.rstrip("/"),
    )
    db.add(oauth_client)
    db.add(grant)
    db.flush()
    access_secret = issue_tokens(db, grant)["access_token"]
    db.commit()

    monkeypatch.setattr(
        mcp_server,
        "SessionLocal",
        lambda: Session(bind=_txn, join_transaction_mode="create_savepoint"),
    )
    verified = asyncio.run(mcp_server.DayPlanTokenVerifier().verify_token(access_secret))
    assert verified is not None
    assert verified.subject == str(user.id)
    assert verified.resource == MCP_RESOURCE_URL
    db.expire_all()
    assert db.query(McpOAuthGrant).filter(McpOAuthGrant.id == grant.id).one().resource == MCP_RESOURCE_URL

    allowlist_row = db.query(McpAllowlistEntry).filter(
        McpAllowlistEntry.user_id == user.id
    ).one()
    allowlist_row.enabled = False
    db.commit()
    assert asyncio.run(mcp_server.DayPlanTokenVerifier().verify_token(access_secret)) is None


def test_streamable_http_requires_and_accepts_oauth_token(
    monkeypatch, _txn, client, db, user
):
    _allow(db, user)
    oauth_client = McpOAuthClient(
        client_id="transport-client",
        client_name="Transport client",
        redirect_uris=["http://127.0.0.1:8765/callback"],
        token_endpoint_auth_method="none",
    )
    grant = McpOAuthGrant(
        user_id=user.id,
        client_id=oauth_client.client_id,
        scopes=["planner:read"],
        resource=MCP_RESOURCE_URL,
    )
    db.add(oauth_client)
    db.add(grant)
    db.flush()
    access_secret = issue_tokens(db, grant)["access_token"]
    db.commit()
    monkeypatch.setattr(
        mcp_server,
        "SessionLocal",
        lambda: Session(bind=_txn, join_transaction_mode="create_savepoint"),
    )

    message = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "pytest", "version": "1.0"},
        },
    }
    transport_headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "Host": urlparse(MCP_RESOURCE_URL).netloc,
    }

    with client:
        denied = client.post("/mcp/", headers=transport_headers, json=message)
        assert denied.status_code == 401
        assert "resource_metadata" in denied.headers["WWW-Authenticate"]

        verified = asyncio.run(mcp_server.mcp._token_verifier.verify_token(access_secret))
        assert verified is not None

        accepted = client.post(
            "/mcp/",
            headers={**transport_headers, "Authorization": f"Bearer {access_secret}"},
            json=message,
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["result"]["serverInfo"]["name"] == "Day Plan"

        listed = client.post(
            "/mcp/",
            headers={
                **transport_headers,
                "Authorization": f"Bearer {access_secret}",
                "MCP-Protocol-Version": accepted.json()["result"]["protocolVersion"],
            },
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        )
        assert listed.status_code == 200, listed.text
        tool_names = {tool["name"] for tool in listed.json()["result"]["tools"]}
        assert len(tool_names) == 39
        assert {"create_day_task", "edit_day_task", "delete_day_task", "get_statistics"} <= tool_names
        assert {
            "delete_account",
            "change_password",
            "change_avatar",
            "list_sessions",
            "edit_university_schedule",
            "reply_to_feedback",
        }.isdisjoint(tool_names)
