"""Tests for /feedback/* endpoints."""
from __future__ import annotations


def _create(client, headers, **overrides):
    data = {"category": "bug", "type": "problem", "message": "Что-то сломалось"}
    data.update(overrides)
    return client.post("/feedback", headers=headers, data=data)


class TestCreate:
    def test_create_without_screenshots(self, client, auth_headers):
        r = _create(client, auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["message"] == "Что-то сломалось"
        assert body["category"] == "bug"
        assert body["type"] == "problem"
        assert body["status"] == "new"

    def test_create_rejects_blank_message(self, client, auth_headers):
        r = _create(client, auth_headers, message="   ")
        assert r.status_code == 400

    def test_create_rejects_non_image_screenshot(self, client, auth_headers):
        r = client.post(
            "/feedback",
            headers=auth_headers,
            data={"category": "bug", "type": "problem", "message": "hi"},
            files=[("screenshots", ("notes.txt", b"plain text", "text/plain"))],
        )
        assert r.status_code == 400

    def test_create_accepts_image_screenshot(self, client, auth_headers):
        r = client.post(
            "/feedback",
            headers=auth_headers,
            data={"category": "bug", "type": "problem", "message": "with shot"},
            files=[("screenshots", ("shot.png", b"\x89PNG\r\n\x1a\n", "image/png"))],
        )
        assert r.status_code == 200
        assert r.json()["screenshots"]
        assert r.json()["screenshots"][0].startswith("feedback/")

    def test_create_requires_auth(self, client):
        r = client.post(
            "/feedback",
            data={"category": "bug", "type": "problem", "message": "hi"},
        )
        assert r.status_code in (401, 403)


class TestListAccess:
    def test_list_all_requires_developer(self, client, auth_headers):
        assert client.get("/feedback", headers=auth_headers).status_code == 403

    def test_developer_sees_all_feedback(self, client, auth_headers, developer_headers):
        _create(client, auth_headers, message="from a regular user")
        rows = client.get("/feedback", headers=developer_headers).json()
        assert any(r["message"] == "from a regular user" for r in rows)

    def test_my_feedback_only_returns_own(
        self, client, auth_headers, other_auth_headers
    ):
        _create(client, auth_headers, message="mine")
        _create(client, other_auth_headers, message="theirs")

        messages = [r["message"] for r in client.get("/feedback/my", headers=auth_headers).json()]
        assert "mine" in messages
        assert "theirs" not in messages


class TestReplyAndStatus:
    def test_reply_requires_developer(self, client, auth_headers):
        created = _create(client, auth_headers).json()
        r = client.patch(
            f"/feedback/{created['id']}/reply",
            headers=auth_headers,
            json={"reply": "ok"},
        )
        assert r.status_code == 403

    def test_developer_reply_sets_fields(self, client, auth_headers, developer_headers):
        created = _create(client, auth_headers).json()
        r = client.patch(
            f"/feedback/{created['id']}/reply",
            headers=developer_headers,
            json={"reply": "Спасибо, чиним"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["developer_reply"] == "Спасибо, чиним"
        assert body["status"] == "in_progress"

    def test_reply_rejects_blank(self, client, auth_headers, developer_headers):
        created = _create(client, auth_headers).json()
        r = client.patch(
            f"/feedback/{created['id']}/reply",
            headers=developer_headers,
            json={"reply": "   "},
        )
        assert r.status_code == 400

    def test_status_update_by_developer(self, client, auth_headers, developer_headers):
        created = _create(client, auth_headers).json()
        r = client.patch(
            f"/feedback/{created['id']}",
            headers=developer_headers,
            json={"status": "resolved"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "resolved"

    def test_reply_404_for_unknown_id(self, client, developer_headers):
        r = client.patch(
            "/feedback/999999/reply",
            headers=developer_headers,
            json={"reply": "x"},
        )
        assert r.status_code == 404
