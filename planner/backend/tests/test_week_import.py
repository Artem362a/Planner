"""Tests for /week-import-candidates/{day} and /day/import-week-tasks.

These endpoints decide which WeekTasks the user can import into a specific
day from the planner: upcoming candidates within a forward window and
overdue candidates within a backward window. Lots of edge cases (recurring vs
range, repeat_days, dedupe, "task already exists in the day").
"""
from __future__ import annotations

from datetime import date, timedelta


MONDAY = date(2025, 6, 2)


def _add_week_task(db, user_id, **kwargs):
    from db import WeekTask
    defaults = dict(
        name="t",
        start_date=MONDAY,
        end_date=MONDAY + timedelta(days=6),
        category=None,
        important=False,
        status=0,
        task_type="normal",
        repeat_days=[],
        subtasks=[],
        order_index=0,
    )
    defaults.update(kwargs)
    row = WeekTask(user_id=user_id, **defaults)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestUpcomingCandidates:
    def test_lists_normal_task_in_range(self, client, db, user, auth_headers):
        _add_week_task(db, user.id, name="this week")

        r = client.get(
            f"/week-import-candidates/{MONDAY.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 6, "days_back": 0},
        )
        assert r.status_code == 200
        titles = [c["title"] for c in r.json() if not c.get("is_overdue")]
        assert "this week" in titles

    def test_excludes_already_imported_into_target_day(self, client, db, user, auth_headers):
        """If a DayTask with the same (title, category) already exists on the
        candidate day, the WeekTask should be hidden from the suggestion list."""
        from db import DayTask

        _add_week_task(db, user.id, name="dup", category="home")
        # Same title+category already on Monday — should suppress the candidate.
        db.add(DayTask(
            user_id=user.id,
            day=MONDAY,
            title="dup",
            category="home",
            priority="medium",
            status=0,
            order_index=0,
        ))
        db.commit()

        r = client.get(
            f"/week-import-candidates/{MONDAY.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 0, "days_back": 0},
        )
        titles = [c["title"] for c in r.json()]
        assert "dup" not in titles

    def test_skips_completed_week_tasks(self, client, db, user, auth_headers):
        _add_week_task(db, user.id, name="done", status=1)

        r = client.get(
            f"/week-import-candidates/{MONDAY.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 0, "days_back": 0},
        )
        titles = [c["title"] for c in r.json()]
        assert "done" not in titles

    def test_recurring_respects_repeat_days(self, client, db, user, auth_headers):
        # Only Wednesdays (weekday 2).
        _add_week_task(
            db,
            user.id,
            name="weekly thing",
            task_type="recurring",
            start_date=MONDAY,
            end_date=MONDAY + timedelta(days=30),
            repeat_days=[2],
        )

        # Look at Monday (weekday 0) — should NOT appear.
        r = client.get(
            f"/week-import-candidates/{MONDAY.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 0, "days_back": 0},
        )
        titles = [c["title"] for c in r.json()]
        assert "weekly thing" not in titles

        # Look at Wednesday — should appear.
        wednesday = MONDAY + timedelta(days=2)
        r2 = client.get(
            f"/week-import-candidates/{wednesday.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 0, "days_back": 0},
        )
        titles2 = [c["title"] for c in r2.json()]
        assert "weekly thing" in titles2

    def test_days_ahead_window(self, client, db, user, auth_headers):
        # Task active 5 days from now.
        target = MONDAY + timedelta(days=5)
        _add_week_task(db, user.id, name="future", start_date=target, end_date=target)

        # days_ahead=2 — outside the window.
        r1 = client.get(
            f"/week-import-candidates/{MONDAY.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 2, "days_back": 0},
        )
        assert "future" not in [c["title"] for c in r1.json()]

        # days_ahead=7 — inside.
        r2 = client.get(
            f"/week-import-candidates/{MONDAY.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 7, "days_back": 0},
        )
        assert "future" in [c["title"] for c in r2.json()]


class TestOverdueCandidates:
    def test_overdue_task_within_window_shown(self, client, db, user, auth_headers):
        # Ended 3 days before MONDAY.
        end = MONDAY - timedelta(days=3)
        _add_week_task(
            db,
            user.id,
            name="missed",
            start_date=end - timedelta(days=1),
            end_date=end,
        )

        r = client.get(
            f"/week-import-candidates/{MONDAY.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 0, "days_back": 7},
        )
        overdue = [c for c in r.json() if c.get("is_overdue")]
        assert any(c["title"] == "missed" for c in overdue)

    def test_overdue_outside_back_window_hidden(self, client, db, user, auth_headers):
        end = MONDAY - timedelta(days=20)
        _add_week_task(
            db,
            user.id,
            name="ancient",
            start_date=end - timedelta(days=1),
            end_date=end,
        )

        r = client.get(
            f"/week-import-candidates/{MONDAY.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 0, "days_back": 7},
        )
        titles = [c["title"] for c in r.json()]
        assert "ancient" not in titles

    def test_recurring_never_overdue(self, client, db, user, auth_headers):
        """Recurring tasks must not show in the overdue bucket."""
        end = MONDAY - timedelta(days=3)
        _add_week_task(
            db,
            user.id,
            name="recurring past",
            task_type="recurring",
            start_date=end - timedelta(days=10),
            end_date=end,
        )

        r = client.get(
            f"/week-import-candidates/{MONDAY.isoformat()}",
            headers=auth_headers,
            params={"days_ahead": 0, "days_back": 7},
        )
        overdue = [c for c in r.json() if c.get("is_overdue")]
        assert all(c["title"] != "recurring past" for c in overdue)


class TestImportWeekTasks:
    def test_import_creates_day_task(self, client, db, user, auth_headers):
        from db import DayTask

        wt = _add_week_task(db, user.id, name="to import")

        r = client.post(
            "/day/import-week-tasks",
            headers=auth_headers,
            json={
                "target_day": MONDAY.isoformat(),
                "items": [
                    {"week_task_id": wt.id, "import_day": MONDAY.isoformat(), "is_overdue": False}
                ],
            },
        )
        assert r.status_code == 200
        out = r.json()
        assert len(out) == 1
        assert out[0]["title"] == "to import"

        # DayTask actually persisted with the FK.
        day_task = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.day == MONDAY,
                DayTask.source_week_task_id == wt.id,
            )
            .first()
        )
        assert day_task is not None

    def test_import_skips_duplicate_title_and_category(self, client, db, user, auth_headers):
        """If the target day already has a task with the same title+category,
        the import is a no-op for that item — don't duplicate."""
        from db import DayTask

        wt = _add_week_task(db, user.id, name="dup", category="home")
        db.add(DayTask(
            user_id=user.id,
            day=MONDAY,
            title="dup",
            category="home",
            priority="medium",
            status=0,
            order_index=0,
        ))
        db.commit()

        r = client.post(
            "/day/import-week-tasks",
            headers=auth_headers,
            json={
                "target_day": MONDAY.isoformat(),
                "items": [
                    {"week_task_id": wt.id, "import_day": MONDAY.isoformat(), "is_overdue": False}
                ],
            },
        )
        assert r.status_code == 200
        assert r.json() == []

        # Still only one DayTask with that title+category.
        assert (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.day == MONDAY,
                DayTask.title == "dup",
                DayTask.category == "home",
            )
            .count()
            == 1
        )

    def test_import_ignores_unknown_week_task_id(self, client, auth_headers):
        r = client.post(
            "/day/import-week-tasks",
            headers=auth_headers,
            json={
                "target_day": MONDAY.isoformat(),
                "items": [
                    {"week_task_id": 99999, "import_day": MONDAY.isoformat()}
                ],
            },
        )
        assert r.status_code == 200
        assert r.json() == []

    def test_overdue_import_bypasses_repeat_days_check(self, client, db, user, auth_headers):
        """If is_overdue=True, the route imports the task regardless of
        whether the target day matches repeat_days (for non-overdue items it
        respects repeat_days)."""
        from db import DayTask

        # Recurring task that only runs on Wednesdays — finished last week.
        wt = _add_week_task(
            db,
            user.id,
            name="missed",
            task_type="recurring",
            start_date=MONDAY - timedelta(days=14),
            end_date=MONDAY - timedelta(days=3),
            repeat_days=[2],  # Wednesdays only
        )

        # Import for Monday — not a Wednesday — but flag is_overdue.
        r = client.post(
            "/day/import-week-tasks",
            headers=auth_headers,
            json={
                "target_day": MONDAY.isoformat(),
                "items": [
                    {"week_task_id": wt.id, "import_day": MONDAY.isoformat(), "is_overdue": True}
                ],
            },
        )
        assert r.status_code == 200
        assert len(r.json()) == 1

        assert (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.day == MONDAY,
                DayTask.source_week_task_id == wt.id,
            )
            .count()
            == 1
        )
