"""Tests for /inbox/* endpoints."""
from __future__ import annotations

from datetime import date, timedelta


class TestInboxCRUD:
    def test_create(self, client, auth_headers):
        r = client.post(
            "/inbox",
            headers=auth_headers,
            json={"title": "thing to do", "priority": "high"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "thing to do"
        assert body["priority"] == "high"
        assert body["id"] > 0

    def test_list_only_my_inbox(self, client, db, user, other_user, auth_headers):
        from db import InboxTask

        db.add(InboxTask(user_id=user.id, title="mine", priority="medium"))
        db.add(InboxTask(user_id=other_user.id, title="theirs", priority="medium"))
        db.commit()

        titles = [t["title"] for t in client.get("/inbox", headers=auth_headers).json()]
        assert titles == ["mine"]

    def test_list_ordered_newest_first(self, client, auth_headers):
        client.post("/inbox", headers=auth_headers, json={"title": "first"})
        client.post("/inbox", headers=auth_headers, json={"title": "second"})

        titles = [t["title"] for t in client.get("/inbox", headers=auth_headers).json()]
        assert titles == ["second", "first"]

    def test_update(self, client, auth_headers):
        created = client.post("/inbox", headers=auth_headers, json={"title": "old"}).json()
        r = client.patch(
            f"/inbox/{created['id']}",
            headers=auth_headers,
            json={"title": "new", "priority": "high"},
        )
        assert r.status_code == 200
        assert r.json()["title"] == "new"
        assert r.json()["priority"] == "high"

    def test_update_404_for_wrong_user(self, client, db, other_user, auth_headers):
        from db import InboxTask

        row = InboxTask(user_id=other_user.id, title="t", priority="medium")
        db.add(row)
        db.commit()
        db.refresh(row)

        r = client.patch(f"/inbox/{row.id}", headers=auth_headers, json={"title": "x"})
        assert r.status_code == 404

    def test_delete(self, client, auth_headers):
        created = client.post("/inbox", headers=auth_headers, json={"title": "t"}).json()
        r = client.delete(f"/inbox/{created['id']}", headers=auth_headers)
        assert r.status_code == 200
        assert client.get("/inbox", headers=auth_headers).json() == []


class TestAssignToDay:
    def test_assign_creates_day_task_and_marks_inbox_assigned(
        self, client, db, user, auth_headers
    ):
        """Assigning an inbox task to a day creates the DayTask and stamps the
        inbox row with assigned_at so the user can still see it in the inbox
        as a reminder."""
        from db import DayTask, InboxTask

        created = client.post(
            "/inbox",
            headers=auth_headers,
            json={"title": "buy milk", "priority": "high", "category": "home"},
        ).json()

        today = date.today()
        r = client.post(
            f"/inbox/{created['id']}/assign-day",
            headers=auth_headers,
            json={"day": today.isoformat()},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "buy milk"
        assert body["priority"] == "high"
        assert body["category"] == "home"
        assert body["day"] == today.isoformat()

        # Inbox row still alive, now stamped.
        rows = db.query(InboxTask).filter(InboxTask.user_id == user.id).all()
        assert len(rows) == 1
        assert rows[0].assigned_at is not None
        # Day task exists.
        assert db.query(DayTask).filter(DayTask.user_id == user.id).count() == 1

    def test_assigned_at_visible_in_listing(self, client, auth_headers):
        from datetime import date as _date

        created = client.post("/inbox", headers=auth_headers, json={"title": "x"}).json()
        assert created["assigned_at"] is None

        client.post(
            f"/inbox/{created['id']}/assign-day",
            headers=auth_headers,
            json={"day": _date.today().isoformat()},
        )

        listing = client.get("/inbox", headers=auth_headers).json()
        assert len(listing) == 1
        assert listing[0]["assigned_at"] is not None

    def test_assign_404_for_unknown_inbox_id(self, client, auth_headers):
        r = client.post(
            "/inbox/9999/assign-day",
            headers=auth_headers,
            json={"day": date.today().isoformat()},
        )
        assert r.status_code == 404

    def test_assign_appends_to_end_of_day(self, client, db, user, auth_headers):
        from db import DayTask

        today = date.today()
        db.add(DayTask(user_id=user.id, day=today, title="existing", priority="medium", status=0, order_index=0))
        db.commit()

        created = client.post("/inbox", headers=auth_headers, json={"title": "from inbox"}).json()
        client.post(
            f"/inbox/{created['id']}/assign-day",
            headers=auth_headers,
            json={"day": today.isoformat()},
        )

        listing = client.get(f"/day/{today.isoformat()}", headers=auth_headers).json()
        titles = [t["title"] for t in listing]
        assert titles == ["existing", "from inbox"]


class TestAssignToWeek:
    def test_assign_creates_week_task_and_day_tasks(self, client, db, user, auth_headers):
        from db import DayTask, InboxTask, WeekTask

        created = client.post(
            "/inbox",
            headers=auth_headers,
            json={"title": "weekly thing", "priority": "high"},
        ).json()

        # Normalises week_start to Monday.
        any_day = date(2025, 6, 4)  # A Wednesday.
        r = client.post(
            f"/inbox/{created['id']}/assign-week",
            headers=auth_headers,
            json={"week_start": any_day.isoformat()},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "weekly thing"
        assert body["start_date"] == "2025-06-02"  # Monday of that week.
        assert body["end_date"] == "2025-06-08"
        assert body["important"] is True  # priority=high

        # Inbox row still alive, now stamped.
        rows = db.query(InboxTask).filter(InboxTask.user_id == user.id).all()
        assert len(rows) == 1
        assert rows[0].assigned_at is not None
        # One WeekTask + 7 DayTasks for the test user.
        assert db.query(WeekTask).filter(WeekTask.user_id == user.id).count() == 1
        assert db.query(DayTask).filter(
            DayTask.user_id == user.id,
            DayTask.day >= date(2025, 6, 2),
            DayTask.day <= date(2025, 6, 8),
        ).count() == 7
