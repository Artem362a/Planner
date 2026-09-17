"""Exercise token exchange with independent PostgreSQL transactions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateSchema, DropSchema

from db import (
    Base, SCHEMAS, engine, User, McpAllowlistEntry, McpOAuthClient,
    McpOAuthAuthorizationCode, McpOAuthGrant, McpOAuthAccessToken,
    McpOAuthRefreshToken,
)
from dependencies import get_db
from mcp_auth import MCP_RESOURCE_URL, hash_secret, issue_tokens, pkce_s256
from rate_limit import limiter
from routers import mcp_oauth


@pytest.fixture
def parallel_oauth():
    # The ordinary test SAVEPOINT cannot be shared between concurrent requests.
    # Give this test its own schemas, so even committed fixtures are isolated.
    prefix = f"test_oauth_{uuid4().hex}_"
    schemas = {name: prefix + name for name in SCHEMAS}
    test_engine = engine.execution_options(schema_translate_map=schemas)
    sessions = sessionmaker(bind=test_engine, autoflush=False)
    with engine.begin() as connection:
        for name in schemas.values():
            connection.execute(CreateSchema(name))
    try:
        Base.metadata.create_all(test_engine)
        with sessions() as db:
            user = User(email="concurrent@test.com", username="concurrent", password_hash="unused")
            db.add(user)
            db.add(McpOAuthClient(client_id="parallel-client", client_name="Parallel client", redirect_uris=["https://example.com/callback"]))
            db.flush()
            db.add(McpAllowlistEntry(user_id=user.id, enabled=True))
            db.add(McpOAuthAuthorizationCode(
                code_hash=hash_secret("parallel-code"), client_id="parallel-client", user_id=user.id,
                redirect_uri="https://example.com/callback", scopes=["planner:read"],
                code_challenge=pkce_s256("v" * 43), resource=MCP_RESOURCE_URL,
                expires_at=datetime.utcnow() + timedelta(minutes=5),
            ))
            db.commit()
            user_id = user.id

        def get_test_db():
            with sessions() as db:
                yield db

        app = FastAPI()
        app.state.limiter = limiter
        app.include_router(mcp_oauth.router)
        app.dependency_overrides[get_db] = get_test_db
        with TestClient(app) as client:
            yield client, sessions, user_id
    finally:
        with engine.begin() as connection:
            for name in schemas.values():
                connection.execute(DropSchema(name, cascade=True))


def _exchange_together(client, data, monkeypatch):
    original = mcp_oauth.is_mcp_allowed
    barrier = Barrier(2)

    def rendezvous(*args, **kwargs):
        # Both sessions must load the unused credential before either locks it.
        barrier.wait(timeout=10)
        return original(*args, **kwargs)

    monkeypatch.setattr(mcp_oauth, "is_mcp_allowed", rendezvous)
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: client.post("/oauth/token", data=data), range(2)))
    return responses


def test_authorization_code_is_single_use_under_concurrency(parallel_oauth, monkeypatch):
    client, sessions, _ = parallel_oauth
    responses = _exchange_together(client, {
        "grant_type": "authorization_code", "client_id": "parallel-client", "code": "parallel-code",
        "redirect_uri": "https://example.com/callback", "code_verifier": "v" * 43,
        "resource": MCP_RESOURCE_URL,
    }, monkeypatch)
    assert sorted(r.status_code for r in responses) == [200, 400]
    assert next(r for r in responses if r.status_code == 400).json()["error"] == "invalid_grant"
    with sessions() as db:
        assert db.query(McpOAuthGrant).count() == 1
        assert db.query(McpOAuthAccessToken).count() == 1


def test_concurrent_refresh_reuse_revokes_connection(parallel_oauth, monkeypatch):
    client, sessions, user_id = parallel_oauth
    with sessions() as db:
        grant = McpOAuthGrant(user_id=user_id, client_id="parallel-client", scopes=["planner:read"], resource=MCP_RESOURCE_URL)
        db.add(grant)
        db.flush()
        tokens = issue_tokens(db, grant)
        db.commit()
    responses = _exchange_together(client, {
        "grant_type": "refresh_token", "client_id": "parallel-client",
        "refresh_token": tokens["refresh_token"], "resource": MCP_RESOURCE_URL,
    }, monkeypatch)
    assert sorted(r.status_code for r in responses) == [200, 400]
    with sessions() as db:
        assert db.query(McpOAuthGrant).one().revoked_at is not None
        assert db.query(McpOAuthAccessToken).filter(McpOAuthAccessToken.revoked_at.is_(None)).count() == 0
        assert db.query(McpOAuthRefreshToken).filter(McpOAuthRefreshToken.revoked_at.is_(None)).count() == 0
