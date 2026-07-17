"""Tests for rate limiting on /auth/*."""
from __future__ import annotations

import pytest

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
                    "password": "password123",
                },
            )
            statuses.append(r.status_code)
        assert statuses[:5] == [200] * 5
        assert statuses[5] == 429

    def test_limit_is_per_ip(self, client, rate_limited):
        """Лимит считается по X-Forwarded-For — исчерпание с одного IP
        не блокирует другой (за туннелем remote_addr у всех одинаковый)."""
        body = {"email": "nobody@test.com", "password": "wrong-password"}
        for _ in range(10):
            client.post("/auth/login", json=body, headers={"X-Forwarded-For": "10.0.0.1"})
        r = client.post("/auth/login", json=body, headers={"X-Forwarded-For": "10.0.0.1"})
        assert r.status_code == 429
        r = client.post("/auth/login", json=body, headers={"X-Forwarded-For": "10.0.0.2"})
        assert r.status_code == 401

    def test_disabled_by_default_in_tests(self, client):
        body = {"email": "nobody@test.com", "password": "wrong-password"}
        for _ in range(12):
            assert client.post("/auth/login", json=body).status_code == 401
