"""Tests for /week-tasks/* endpoints."""
from __future__ import annotations

from datetime import date, timedelta

import pytest


# Use a fixed historical Monday so weekdays and dates are deterministic.
MONDAY = date(2025, 6, 2)   # Monday
SUNDAY = date(2025, 6, 8)   # Sunday


def _create_week_task(client, headers, **overrides):
    payload = {
        "name": "wt",
        "start_date": MONDAY.isoformat(),
        "end_date": SUNDAY.isoformat(),
        "important": False,
        "status": 0,
        "task_type": "normal",
        "repeat_days": [],
        "subtasks": [],
    }
    payload.update(overrides)
    return client.post("/week-tasks", headers=headers, json=payload)


class TestCreateWeekTask:
    def test_basic_create(self, client, auth_headers):
        r = _create_week_task(client, auth_headers, name="Work out")
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "Work out"
        assert body["start_date"] == MONDAY.isoformat()
        assert body["end_date"] == SUNDAY.isoformat()
        assert body["id"] > 0

    def test_create_normal_spawns_daytask_per_day(self, client, db, user, auth_headers):
        from db import DayTask

        r = _create_week_task(client, auth_headers, name="Daily thing")
        wt_id = r.json()["id"]

        day_tasks = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .all()
        )
        assert len(day_tasks) == 7  # Mon-Sun
        # Each is tied to the right title and category.
        assert all(t.title == "Daily thing" for t in day_tasks)

    def test_create_with_repeat_days_only_spawns_those_days(self, client, db, user, auth_headers):
        from db import DayTask

        # repeat_days uses weekday() ints: Mon=0..Sun=6
        r = _create_week_task(
            client, auth_headers, name="Mon/Wed/Fri", repeat_days=[0, 2, 4]
        )
        wt_id = r.json()["id"]

        day_tasks = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .all()
        )
        assert len(day_tasks) == 3
        weekdays = sorted(t.day.weekday() for t in day_tasks)
        assert weekdays == [0, 2, 4]

    def test_important_creates_high_priority_daytasks(self, client, db, user, auth_headers):
        from db import DayTask

        r = _create_week_task(client, auth_headers, important=True)
        wt_id = r.json()["id"]

        tasks = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .all()
        )
        assert all(t.priority == "high" for t in tasks)


class TestListWeekTasks:
    def test_list_returns_task_for_week(self, client, auth_headers):
        _create_week_task(client, auth_headers, name="in week")

        r = client.get(
            "/week-tasks", headers=auth_headers, params={"week_start": MONDAY.isoformat()}
        )
        assert r.status_code == 200
        names = [t["name"] for t in r.json()]
        assert "in week" in names

    def test_list_filters_out_other_weeks(self, client, auth_headers):
        # Normal task in week of June 2.
        _create_week_task(client, auth_headers, name="this week")

        # Task far in the past.
        _create_week_task(
            client,
            auth_headers,
            name="ancient",
            start_date="2020-01-06",
            end_date="2020-01-12",
        )

        r = client.get(
            "/week-tasks", headers=auth_headers, params={"week_start": MONDAY.isoformat()}
        )
        names = [t["name"] for t in r.json()]
        assert "this week" in names
        assert "ancient" not in names

    def test_list_includes_recurring_overlapping_week(self, client, auth_headers):
        # Recurring task spanning a long range that overlaps the target week.
        _create_week_task(
            client,
            auth_headers,
            name="ongoing",
            task_type="recurring",
            start_date="2025-01-01",
            end_date="2025-12-31",
            repeat_days=[0, 1, 2, 3, 4, 5, 6],
        )

        r = client.get(
            "/week-tasks", headers=auth_headers, params={"week_start": MONDAY.isoformat()}
        )
        names = [t["name"] for t in r.json()]
        assert "ongoing" in names

    def test_list_ordered_important_first(self, client, auth_headers):
        _create_week_task(client, auth_headers, name="normal")
        _create_week_task(client, auth_headers, name="urgent", important=True)

        r = client.get(
            "/week-tasks", headers=auth_headers, params={"week_start": MONDAY.isoformat()}
        )
        names = [t["name"] for t in r.json()]
        assert names.index("urgent") < names.index("normal")

    def test_recurring_listing_backfills_missing_day_tasks(self, client, db, user, auth_headers):
        """Listing a recurring week task should lazily create missing DayTasks
        for any day in the requested week."""
        from db import DayTask

        r = _create_week_task(
            client,
            auth_headers,
            name="lazy",
            task_type="recurring",
            start_date="2025-01-01",
            end_date="2025-12-31",
            repeat_days=[0, 1, 2, 3, 4, 5, 6],
        )
        wt_id = r.json()["id"]

        # Delete the day tasks the POST created — pretend they were never made
        # for this particular week.
        db.query(DayTask).filter(
            DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id
        ).delete()
        db.commit()

        # List for a week far in the future; no day tasks yet.
        future_monday = date(2025, 7, 7)
        before = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .filter(DayTask.day >= future_monday)
            .filter(DayTask.day <= future_monday + timedelta(days=6))
            .count()
        )
        assert before == 0

        client.get(
            "/week-tasks", headers=auth_headers, params={"week_start": future_monday.isoformat()}
        )

        after = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .filter(DayTask.day >= future_monday)
            .filter(DayTask.day <= future_monday + timedelta(days=6))
            .count()
        )
        assert after == 7


class TestImportantWeekTasks:
    def test_only_returns_important_pending(self, client, auth_headers):
        _create_week_task(client, auth_headers, name="not important")
        _create_week_task(client, auth_headers, name="very important", important=True)

        r = client.get(
            "/week-tasks/important",
            headers=auth_headers,
            params={"week_start": MONDAY.isoformat()},
        )
        names = [t["name"] for t in r.json()]
        assert names == ["very important"]

    def test_excludes_completed(self, client, auth_headers):
        _create_week_task(
            client, auth_headers, name="done", important=True, status=1
        )

        r = client.get(
            "/week-tasks/important",
            headers=auth_headers,
            params={"week_start": MONDAY.isoformat()},
        )
        names = [t["name"] for t in r.json()]
        assert "done" not in names


class TestUpdateWeekTask:
    def test_rename_updates_pending_day_tasks(self, client, db, user, auth_headers):
        from db import DayTask

        r = _create_week_task(client, auth_headers, name="old")
        wt_id = r.json()["id"]

        client.patch(
            f"/week-tasks/{wt_id}",
            headers=auth_headers,
            json={
                "name": "new",
                "start_date": MONDAY.isoformat(),
                "end_date": SUNDAY.isoformat(),
                "important": False,
                "status": 0,
                "task_type": "normal",
                "repeat_days": [],
                "subtasks": [],
            },
        )

        titles = {
            t.title
            for t in db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .all()
        }
        assert titles == {"new"}

    def test_adding_subtasks_later_propagates_to_day_tasks(
        self, client, db, user, auth_headers
    ):
        """Подзадачи, добавленные в недельную задачу после создания, должны
        дотянуться в уже авто-созданные дневные задачи (баг: импорт в день без
        подзадач)."""
        from db import DayTask

        r = _create_week_task(client, auth_headers, name="wt")  # без подзадач
        wt_id = r.json()["id"]

        # День уже создан без подзадач.
        day_task = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .first()
        )
        assert not day_task.subtasks

        client.patch(
            f"/week-tasks/{wt_id}",
            headers=auth_headers,
            json={
                "name": "wt",
                "start_date": MONDAY.isoformat(),
                "end_date": SUNDAY.isoformat(),
                "important": False,
                "status": 0,
                "task_type": "normal",
                "repeat_days": [],
                "subtasks": [
                    {"id": 1, "title": "sub A", "done": False},
                    {"id": 2, "title": "sub B", "done": False},
                ],
            },
        )

        db.expire_all()
        day_tasks = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .all()
        )
        assert day_tasks
        for dt in day_tasks:
            assert [s["title"] for s in dt.subtasks] == ["sub A", "sub B"]

    def test_rename_does_not_overwrite_completed_day_tasks(
        self, client, db, user, auth_headers
    ):
        """If a DayTask was already completed (status=1), renaming the WeekTask
        should NOT rewrite its title — it's a historical record."""
        from db import DayTask

        r = _create_week_task(client, auth_headers, name="old")
        wt_id = r.json()["id"]

        # Mark Monday's day-task as completed.
        monday_task = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.source_week_task_id == wt_id,
                DayTask.day == MONDAY,
            )
            .first()
        )
        monday_task.status = 1
        db.commit()

        client.patch(
            f"/week-tasks/{wt_id}",
            headers=auth_headers,
            json={
                "name": "new",
                "start_date": MONDAY.isoformat(),
                "end_date": SUNDAY.isoformat(),
                "important": False,
                "status": 0,
                "task_type": "normal",
                "repeat_days": [],
                "subtasks": [],
            },
        )

        db.refresh(monday_task)
        assert monday_task.title == "old"  # Completed one keeps the old name.

    def test_shrink_range_deletes_pending_outside(self, client, db, user, auth_headers):
        from db import DayTask

        r = _create_week_task(client, auth_headers, name="full")
        wt_id = r.json()["id"]

        # Shrink to Tue-Thu.
        new_start = date(2025, 6, 3)  # Tuesday
        new_end = date(2025, 6, 5)    # Thursday
        client.patch(
            f"/week-tasks/{wt_id}",
            headers=auth_headers,
            json={
                "name": "full",
                "start_date": new_start.isoformat(),
                "end_date": new_end.isoformat(),
                "important": False,
                "status": 0,
                "task_type": "normal",
                "repeat_days": [],
                "subtasks": [],
            },
        )

        remaining = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .all()
        )
        days = sorted(t.day for t in remaining)
        assert days == [new_start, date(2025, 6, 4), new_end]

    def test_change_repeat_days_filters_day_tasks(self, client, db, user, auth_headers):
        from db import DayTask

        r = _create_week_task(client, auth_headers, name="all days")
        wt_id = r.json()["id"]

        # Switch to Mon/Wed/Fri only.
        client.patch(
            f"/week-tasks/{wt_id}",
            headers=auth_headers,
            json={
                "name": "all days",
                "start_date": MONDAY.isoformat(),
                "end_date": SUNDAY.isoformat(),
                "important": False,
                "status": 0,
                "task_type": "normal",
                "repeat_days": [0, 2, 4],
                "subtasks": [],
            },
        )

        remaining = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .all()
        )
        weekdays = sorted(t.day.weekday() for t in remaining)
        assert weekdays == [0, 2, 4]


class TestDeleteWeekTask:
    def test_delete_removes_pending_day_tasks(self, client, db, user, auth_headers):
        from db import DayTask, WeekTask

        r = _create_week_task(client, auth_headers, name="t")
        wt_id = r.json()["id"]

        client.delete(f"/week-tasks/{wt_id}", headers=auth_headers)

        assert db.query(WeekTask).filter(WeekTask.id == wt_id).first() is None
        assert (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.source_week_task_id == wt_id)
            .count()
            == 0
        )

    def test_delete_keeps_completed_day_tasks(self, client, db, user, auth_headers):
        from db import DayTask

        r = _create_week_task(client, auth_headers, name="t")
        wt_id = r.json()["id"]

        monday_task = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.source_week_task_id == wt_id,
                DayTask.day == MONDAY,
            )
            .first()
        )
        monday_task.status = 1
        db.commit()
        monday_id = monday_task.id

        client.delete(f"/week-tasks/{wt_id}", headers=auth_headers)

        assert db.query(DayTask).filter(DayTask.id == monday_id).first() is not None

    def test_delete_404_for_unknown_id(self, client, auth_headers):
        r = client.delete("/week-tasks/99999", headers=auth_headers)
        assert r.status_code == 404


class TestReorderWeekTasks:
    def test_reorder(self, client, db, user, auth_headers):
        a = _create_week_task(client, auth_headers, name="a").json()
        b = _create_week_task(client, auth_headers, name="b").json()
        c = _create_week_task(client, auth_headers, name="c").json()

        r = client.post(
            "/week-tasks/reorder",
            headers=auth_headers,
            json={"ordered_ids": [c["id"], a["id"], b["id"]]},
        )
        assert r.status_code == 200

        from db import WeekTask
        rows = (
            db.query(WeekTask)
            .filter(WeekTask.user_id == user.id)
            .order_by(WeekTask.order_index)
            .all()
        )
        assert [r.name for r in rows] == ["c", "a", "b"]

    def test_reorder_404_for_unknown_id(self, client, auth_headers):
        a = _create_week_task(client, auth_headers, name="a").json()
        r = client.post(
            "/week-tasks/reorder",
            headers=auth_headers,
            json={"ordered_ids": [a["id"], 99999]},
        )
        assert r.status_code == 404
