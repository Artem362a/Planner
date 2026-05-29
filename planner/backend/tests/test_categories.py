"""Tests for /categories/* endpoints."""
from __future__ import annotations

from datetime import date


def _make_category(db, user_id, *, key, title="Cat", color="#123456", icon="tag"):
    from db import TaskCategory

    row = TaskCategory(user_id=user_id, key=key, title=title, color=color, icon=icon)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestCreateAndList:
    def test_create(self, client, auth_headers):
        r = client.post(
            "/categories",
            headers=auth_headers,
            json={"title": "Спорт", "color": "#FF0000", "icon": "run"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "Спорт"
        assert body["color"] == "#FF0000"
        assert body["icon"] == "run"
        assert body["id"] > 0
        assert body["key"]

    def test_create_rejects_blank_title(self, client, auth_headers):
        r = client.post(
            "/categories",
            headers=auth_headers,
            json={"title": "   ", "color": "#FF0000"},
        )
        assert r.status_code == 400

    def test_list_only_my_categories(self, client, db, user, other_user, auth_headers):
        _make_category(db, user.id, key="mine", title="Mine")
        _make_category(db, other_user.id, key="theirs", title="Theirs")

        titles = [c["title"] for c in client.get("/categories", headers=auth_headers).json()]
        assert titles == ["Mine"]

    def test_list_requires_auth(self, client):
        assert client.get("/categories").status_code in (401, 403)


class TestUpdate:
    def test_update_own(self, client, db, user, auth_headers):
        row = _make_category(db, user.id, key="c1", title="Old", color="#000000")
        r = client.patch(
            f"/categories/{row.id}",
            headers=auth_headers,
            json={"title": "New", "color": "#FFFFFF", "icon": "star"},
        )
        assert r.status_code == 200
        assert r.json()["title"] == "New"
        assert r.json()["color"] == "#FFFFFF"
        assert r.json()["icon"] == "star"

    def test_update_404_for_other_user(self, client, db, other_user, auth_headers):
        row = _make_category(db, other_user.id, key="theirs", title="Theirs")
        r = client.patch(
            f"/categories/{row.id}",
            headers=auth_headers,
            json={"title": "Hacked", "color": "#000000"},
        )
        assert r.status_code == 404


class TestDelete:
    def test_delete_reassigns_tasks_to_other(self, client, db, user, auth_headers):
        from db import DayTask

        _make_category(db, user.id, key="other", title="Другое")
        work = _make_category(db, user.id, key="work", title="Работа")

        db.add(
            DayTask(
                user_id=user.id,
                day=date.today(),
                title="task",
                priority="medium",
                status=0,
                order_index=0,
                category="work",
            )
        )
        db.commit()

        r = client.delete(f"/categories/{work.id}", headers=auth_headers)
        assert r.status_code == 200

        # The orphaned task is moved to the fallback "other" category.
        moved = db.query(DayTask).filter(DayTask.user_id == user.id).first()
        assert moved.category == "other"

    def test_cannot_delete_other_category(self, client, db, user, auth_headers):
        row = _make_category(db, user.id, key="other", title="Другое")
        r = client.delete(f"/categories/{row.id}", headers=auth_headers)
        assert r.status_code == 400

    def test_delete_404_for_other_user(self, client, db, other_user, auth_headers):
        _make_category(db, other_user.id, key="other", title="Другое")
        row = _make_category(db, other_user.id, key="theirs", title="Theirs")
        r = client.delete(f"/categories/{row.id}", headers=auth_headers)
        assert r.status_code == 404
