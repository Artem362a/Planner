"""Tests for rate limiting on /auth/*."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from rate_limit import limiter


@pytest.fixture
def rate_limited():
    """Включает лимитер на время теста (в conftest он выключен глобально)."""
    limiter.reset()
    limiter.enabled = True
    try:
        yield
    finally:
        limiter.enabled = False
        limiter.reset()


class TestRateLimit:
    def test_login_returns_429_after_limit(self, client, rate_limited):
        body = {"email": "nobody@test.com", "password": "wrong-password"}
        for _ in range(10):
            r = client.post("/auth/login", json=body)
            assert r.status_code == 401
        r = client.post("/auth/login", json=body)
        assert r.status_code == 429

    def test_register_returns_429_after_limit(self, client, rate_limited):
        statuses = []
        for i in range(6):
            r = client.post(
                "/auth/register",
                json={
                    "email": f"user{i}@test.com",
                    "username": f"user{i}",
                    "password": "pass1234",
                },
            )
            statuses.append(r.status_code)
        assert statuses[:5] == [200] * 5
        assert statuses[5] == 429

    def test_limit_is_per_ip(self, client, rate_limited):
        """Use the ASGI client address, already resolved by Uvicorn in production."""
        body = {"email": "nobody@test.com", "password": "wrong-password"}
        first = TestClient(client.app, client=("198.51.100.1", 12345))
        second = TestClient(client.app, client=("198.51.100.2", 12345))
        try:
            for _ in range(10):
                assert first.post("/auth/login", json=body).status_code == 401
            assert first.post("/auth/login", json=body).status_code == 429
            assert second.post("/auth/login", json=body).status_code == 401
        finally:
            first.close()
            second.close()

    def test_forged_forwarded_addresses_do_not_reset_limit(self, client, rate_limited):
        body = {"email": "nobody@test.com", "password": "wrong-password"}
        statuses = [
            client.post(
                "/auth/login", json=body,
                headers={"X-Forwarded-For": f"198.51.100.{i + 1}, 192.0.2.10"},
            ).status_code
            for i in range(12)
        ]
        assert statuses == [401] * 10 + [429] * 2

    def test_disabled_by_default_in_tests(self, client):
        body = {"email": "nobody@test.com", "password": "wrong-password"}
        for _ in range(12):
            assert client.post("/auth/login", json=body).status_code == 401
