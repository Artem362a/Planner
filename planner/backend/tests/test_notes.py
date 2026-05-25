"""Tests for /day-notes/{day} endpoints."""
from __future__ import annotations

TODAY = "2026-01-15"


class TestGetDayNote:
    def test_empty_note_returns_empty_string(self, client, auth_headers):
        r = client.get(f"/day-notes/{TODAY}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == {"day": TODAY, "text": ""}

    def test_unauthenticated(self, client):
        r = client.get(f"/day-notes/{TODAY}")
        assert r.status_code == 401

    def test_bad_date_format(self, client, auth_headers):
        r = client.get("/day-notes/not-a-date", headers=auth_headers)
        assert r.status_code == 400

    def test_returns_saved_note(self, client, auth_headers):
        client.put(f"/day-notes/{TODAY}", headers=auth_headers, json={"text": "hello"})
        r = client.get(f"/day-notes/{TODAY}", headers=auth_headers)
        assert r.json()["text"] == "hello"

    def test_note_isolated_per_user(self, client, auth_headers, other_auth_headers):
        client.put(f"/day-notes/{TODAY}", headers=auth_headers, json={"text": "mine"})
        r = client.get(f"/day-notes/{TODAY}", headers=other_auth_headers)
        assert r.json()["text"] == ""


class TestUpsertDayNote:
    def test_create_note(self, client, auth_headers):
        r = client.put(f"/day-notes/{TODAY}", headers=auth_headers, json={"text": "plan for today"})
        assert r.status_code == 200
        assert r.json()["text"] == "plan for today"
        assert r.json()["day"] == TODAY

    def test_update_note(self, client, auth_headers):
        client.put(f"/day-notes/{TODAY}", headers=auth_headers, json={"text": "first"})
        r = client.put(f"/day-notes/{TODAY}", headers=auth_headers, json={"text": "updated"})
        assert r.json()["text"] == "updated"

    def test_clear_note(self, client, auth_headers):
        client.put(f"/day-notes/{TODAY}", headers=auth_headers, json={"text": "something"})
        r = client.put(f"/day-notes/{TODAY}", headers=auth_headers, json={"text": ""})
        assert r.json()["text"] == ""

    def test_unauthenticated(self, client):
        r = client.put(f"/day-notes/{TODAY}", json={"text": "x"})
        assert r.status_code == 401

    def test_bad_date_format(self, client, auth_headers):
        r = client.put("/day-notes/bad-date", headers=auth_headers, json={"text": "x"})
        assert r.status_code == 400

    def test_different_days_independent(self, client, auth_headers):
        client.put("/day-notes/2026-01-15", headers=auth_headers, json={"text": "monday"})
        client.put("/day-notes/2026-01-16", headers=auth_headers, json={"text": "tuesday"})
        r1 = client.get("/day-notes/2026-01-15", headers=auth_headers)
        r2 = client.get("/day-notes/2026-01-16", headers=auth_headers)
        assert r1.json()["text"] == "monday"
        assert r2.json()["text"] == "tuesday"
