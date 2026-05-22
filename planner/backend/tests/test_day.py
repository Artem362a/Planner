"""Tests for /day/* and /day-tasks/* endpoints."""
from __future__ import annotations

from datetime import date, timedelta


TODAY = date.today().isoformat()


class TestGetDay:
    def test_empty_day(self, client, auth_headers):
        r = client.get(f"/day/{TODAY}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_returns_only_my_tasks(self, client, db, user, other_user, auth_headers):
        from db import DayTask
        from datetime import date

        d = date.today()
        db.add(DayTask(user_id=user.id, day=d, title="mine", priority="medium", status=0, order_index=0))
        db.add(DayTask(user_id=other_user.id, day=d, title="theirs", priority="medium", status=0, order_index=0))
        db.commit()

        r = client.get(f"/day/{TODAY}", headers=auth_headers)
        titles = [t["title"] for t in r.json()]
        assert titles == ["mine"]

    def test_bad_date_format(self, client, auth_headers):
        r = client.get("/day/not-a-date", headers=auth_headers)
        assert r.status_code == 400

    def test_ordered_by_order_index(self, client, db, user, auth_headers):
        from db import DayTask
        from datetime import date

        d = date.today()
        db.add(DayTask(user_id=user.id, day=d, title="b", priority="medium", status=0, order_index=1))
        db.add(DayTask(user_id=user.id, day=d, title="a", priority="medium", status=0, order_index=0))
        db.commit()

        r = client.get(f"/day/{TODAY}", headers=auth_headers)
        titles = [t["title"] for t in r.json()]
        assert titles == ["a", "b"]


class TestCreateTask:
    def test_basic_create(self, client, auth_headers):
        r = client.post(
            f"/day/{TODAY}/tasks",
            headers=auth_headers,
            json={"title": "Buy milk"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "Buy milk"
        assert body["status"] == 0
        assert body["priority"] == "medium"
        assert body["id"] > 0

    def test_create_with_time_and_duration(self, client, auth_headers):
        r = client.post(
            f"/day/{TODAY}/tasks",
            headers=auth_headers,
            json={"title": "Run", "start_time": "07:30", "duration_min": 45},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["start_time"].startswith("07:30")
        assert body["duration_min"] == 45

    def test_create_appends_to_end(self, client, auth_headers):
        for title in ("a", "b", "c"):
            client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": title})

        r = client.get(f"/day/{TODAY}", headers=auth_headers)
        order_indices = [t["order_index"] for t in r.json()]
        assert order_indices == sorted(order_indices)
        assert order_indices == [0, 1, 2]

    def test_create_insert_before_shifts_others(self, client, auth_headers):
        first = client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "first"}).json()
        client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "second"})

        # Insert "new" before "first".
        r = client.post(
            f"/day/{TODAY}/tasks",
            headers=auth_headers,
            json={"title": "new", "insert_before_id": first["id"]},
        )
        assert r.status_code == 200

        titles = [t["title"] for t in client.get(f"/day/{TODAY}", headers=auth_headers).json()]
        assert titles == ["new", "first", "second"]


class TestUpdateTask:
    def test_update_title(self, client, auth_headers):
        created = client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "old"}).json()
        r = client.patch(
            f"/day/{TODAY}/tasks/{created['id']}",
            headers=auth_headers,
            json={"title": "new"},
        )
        assert r.status_code == 200
        assert r.json()["title"] == "new"

    def test_update_status_to_done(self, client, auth_headers):
        created = client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "t"}).json()
        r = client.patch(
            f"/day/{TODAY}/tasks/{created['id']}",
            headers=auth_headers,
            json={"title": "t", "status": 1},
        )
        assert r.json()["status"] == 1

    def test_update_clears_start_time(self, client, auth_headers):
        created = client.post(
            f"/day/{TODAY}/tasks",
            headers=auth_headers,
            json={"title": "t", "start_time": "10:00"},
        ).json()
        r = client.patch(
            f"/day/{TODAY}/tasks/{created['id']}",
            headers=auth_headers,
            json={"title": "t", "start_time": ""},
        )
        assert r.json()["start_time"] is None

    def test_update_404_for_wrong_user(self, client, db, other_user, auth_headers):
        from db import DayTask
        from datetime import date

        task = DayTask(
            user_id=other_user.id,
            day=date.today(),
            title="theirs",
            priority="medium",
            status=0,
            order_index=0,
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        r = client.patch(
            f"/day/{TODAY}/tasks/{task.id}",
            headers=auth_headers,
            json={"title": "hacked"},
        )
        assert r.status_code == 404


class TestDeleteTask:
    def test_delete(self, client, auth_headers):
        created = client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "t"}).json()
        r = client.delete(f"/day/{TODAY}/tasks/{created['id']}", headers=auth_headers)
        assert r.status_code == 200

        listing = client.get(f"/day/{TODAY}", headers=auth_headers).json()
        assert listing == []

    def test_delete_404(self, client, auth_headers):
        r = client.delete(f"/day/{TODAY}/tasks/9999", headers=auth_headers)
        assert r.status_code == 404


class TestReorder:
    def test_reorder(self, client, auth_headers):
        a = client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "a"}).json()
        b = client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "b"}).json()
        c = client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "c"}).json()

        client.post(
            f"/day/{TODAY}/reorder",
            headers=auth_headers,
            json={"ordered_ids": [c["id"], a["id"], b["id"]]},
        )

        titles = [t["title"] for t in client.get(f"/day/{TODAY}", headers=auth_headers).json()]
        assert titles == ["c", "a", "b"]

    def test_reorder_404_unknown_id(self, client, auth_headers):
        a = client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "a"}).json()
        r = client.post(
            f"/day/{TODAY}/reorder",
            headers=auth_headers,
            json={"ordered_ids": [a["id"], 99999]},
        )
        assert r.status_code == 404


class TestDaySettings:
    def test_get_returns_user_default_for_future_day(self, client, db, user, auth_headers):
        from datetime import time as _time
        user.default_day_start_time = _time(8, 0)
        db.commit()

        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        r = client.get(f"/day/{tomorrow}/settings", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["start_time"] == "08:00"

    def test_get_returns_06_for_past_day_without_row(self, client, db, user, auth_headers):
        from datetime import time as _time
        user.default_day_start_time = _time(8, 0)
        db.commit()

        yesterday = (date.today() - timedelta(days=1)).isoformat()
        r = client.get(f"/day/{yesterday}/settings", headers=auth_headers)
        assert r.json()["start_time"] == "06:00"

    def test_save_settings_persists(self, client, auth_headers):
        r = client.put(
            f"/day/{TODAY}/settings",
            headers=auth_headers,
            json={"start_time": "09:30"},
        )
        assert r.status_code == 200

        r2 = client.get(f"/day/{TODAY}/settings", headers=auth_headers)
        assert r2.json()["start_time"] == "09:30"

    def test_save_settings_bad_time(self, client, auth_headers):
        r = client.put(
            f"/day/{TODAY}/settings",
            headers=auth_headers,
            json={"start_time": "nope"},
        )
        assert r.status_code == 400


class TestOverdueTasks:
    def test_returns_past_pending(self, client, db, user, auth_headers):
        from db import DayTask

        yesterday = date.today() - timedelta(days=1)
        db.add(DayTask(user_id=user.id, day=yesterday, title="late", priority="medium", status=0, order_index=0))
        db.commit()

        r = client.get("/day-tasks/overdue", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["title"] == "late"

    def test_excludes_dismissed(self, client, db, user, auth_headers):
        from db import DayTask

        yesterday = date.today() - timedelta(days=1)
        db.add(DayTask(user_id=user.id, day=yesterday, title="kept", priority="medium", status=0, order_index=0))
        db.add(DayTask(user_id=user.id, day=yesterday, title="dismissed", priority="medium", status=0, dismissed=True, order_index=1))
        db.commit()

        r = client.get("/day-tasks/overdue", headers=auth_headers)
        titles = [t["title"] for t in r.json()]
        assert titles == ["kept"]

    def test_excludes_completed(self, client, db, user, auth_headers):
        from db import DayTask

        yesterday = date.today() - timedelta(days=1)
        db.add(DayTask(user_id=user.id, day=yesterday, title="done", priority="medium", status=1, order_index=0))
        db.commit()

        r = client.get("/day-tasks/overdue", headers=auth_headers)
        assert r.json() == []

    def test_excludes_today(self, client, db, user, auth_headers):
        from db import DayTask

        db.add(DayTask(user_id=user.id, day=date.today(), title="today", priority="medium", status=0, order_index=0))
        db.commit()

        r = client.get("/day-tasks/overdue", headers=auth_headers)
        assert r.json() == []


class TestDismiss:
    def test_dismiss_marks_dismissed(self, client, db, user, auth_headers):
        from db import DayTask

        yesterday = date.today() - timedelta(days=1)
        task = DayTask(user_id=user.id, day=yesterday, title="late", priority="medium", status=0, order_index=0)
        db.add(task)
        db.commit()
        db.refresh(task)

        r = client.delete(f"/day-tasks/{task.id}/dismiss", headers=auth_headers)
        assert r.status_code == 200

        db.refresh(task)
        assert task.dismissed is True

    def test_dismiss_404(self, client, auth_headers):
        r = client.delete("/day-tasks/9999/dismiss", headers=auth_headers)
        assert r.status_code == 404


class TestReschedule:
    def test_reschedule_moves_task_to_new_date(self, client, db, user, auth_headers):
        from db import DayTask

        yesterday = date.today() - timedelta(days=1)
        task = DayTask(user_id=user.id, day=yesterday, title="late", priority="medium", status=0, order_index=0)
        db.add(task)
        db.commit()
        db.refresh(task)
        old_id = task.id

        tomorrow = date.today() + timedelta(days=1)
        r = client.post(
            f"/day-tasks/{old_id}/reschedule",
            headers=auth_headers,
            json={"new_date": tomorrow.isoformat()},
        )
        assert r.status_code == 200
        assert r.json()["day"] == tomorrow.isoformat()
        assert r.json()["title"] == "late"

        # Old task gone, new exists.
        assert db.query(DayTask).filter(DayTask.id == old_id).first() is None
        assert db.query(DayTask).filter(
            DayTask.user_id == user.id, DayTask.day == tomorrow
        ).count() == 1

    def test_reschedule_to_past_is_forbidden(self, client, db, user, auth_headers):
        from db import DayTask

        yesterday = date.today() - timedelta(days=1)
        task = DayTask(user_id=user.id, day=yesterday, title="late", priority="medium", status=0, order_index=0)
        db.add(task)
        db.commit()
        db.refresh(task)

        r = client.post(
            f"/day-tasks/{task.id}/reschedule",
            headers=auth_headers,
            json={"new_date": (date.today() - timedelta(days=2)).isoformat()},
        )
        assert r.status_code == 400
