"""Cascade tests for the day↔week sync logic in PATCH /day/{day}/tasks/{id}.

When a DayTask has source_week_task_id, mutating it can ripple into other
DayTasks and the parent WeekTask. This file locks that contract.
"""
from __future__ import annotations

from datetime import date


MONDAY = date(2025, 6, 2)
TUESDAY = date(2025, 6, 3)
WEDNESDAY = date(2025, 6, 4)
THURSDAY = date(2025, 6, 5)
SUNDAY = date(2025, 6, 8)


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
    return client.post("/week-tasks", headers=headers, json=payload).json()


def _day_task_id(db, user_id, week_task_id, day):
    from db import DayTask
    row = (
        db.query(DayTask)
        .filter(
            DayTask.user_id == user_id,
            DayTask.source_week_task_id == week_task_id,
            DayTask.day == day,
        )
        .first()
    )
    return row.id if row else None


class TestMarkDoneCascade:
    def test_mark_wed_done_marks_past_days_done(self, client, db, user, auth_headers):
        """Marking Wednesday done should bulk-complete Monday and Tuesday."""
        from db import DayTask

        wt = _create_week_task(client, auth_headers, name="cascade")
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "cascade", "status": 1, "source_week_task_id": wt["id"]},
        )

        mon = db.query(DayTask).filter(
            DayTask.user_id == user.id,
            DayTask.source_week_task_id == wt["id"],
            DayTask.day == MONDAY,
        ).first()
        tue = db.query(DayTask).filter(
            DayTask.user_id == user.id,
            DayTask.source_week_task_id == wt["id"],
            DayTask.day == TUESDAY,
        ).first()
        assert mon.status == 1
        assert tue.status == 1

    def test_mark_wed_done_deletes_future_days(self, client, db, user, auth_headers):
        from db import DayTask

        wt = _create_week_task(client, auth_headers, name="cascade")
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "cascade", "status": 1, "source_week_task_id": wt["id"]},
        )

        # Days after Wed should be gone (they were status=0).
        future = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.source_week_task_id == wt["id"],
                DayTask.day > WEDNESDAY,
            )
            .count()
        )
        assert future == 0

    def test_mark_done_syncs_week_task_status(self, client, db, user, auth_headers):
        from db import WeekTask

        wt = _create_week_task(client, auth_headers, name="cascade")
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "cascade", "status": 1, "source_week_task_id": wt["id"]},
        )

        week_row = db.query(WeekTask).filter(WeekTask.id == wt["id"]).first()
        assert week_row.status == 1


class TestAllSubtasksDoneAutoCompletes:
    def test_all_subtasks_done_marks_task_done(self, client, db, user, auth_headers):
        """When the route receives a payload where every subtask is done, it
        auto-flips status to 1 even if status wasn't explicitly set."""
        from db import DayTask

        wt = _create_week_task(
            client,
            auth_headers,
            name="multi",
            subtasks=[{"title": "s1"}, {"title": "s2"}],
        )
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={
                "title": "multi",
                "status": 0,  # explicitly 0; route will flip to 1.
                "source_week_task_id": wt["id"],
                "subtasks": [{"title": "s1", "done": True}, {"title": "s2", "done": True}],
            },
        )

        row = db.query(DayTask).filter(DayTask.id == wed_id).first()
        assert row.status == 1

    def test_partial_subtasks_done_keeps_status(self, client, db, user, auth_headers):
        from db import DayTask

        wt = _create_week_task(
            client,
            auth_headers,
            name="multi",
            subtasks=[{"title": "s1"}, {"title": "s2"}],
        )
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={
                "title": "multi",
                "status": 0,
                "source_week_task_id": wt["id"],
                "subtasks": [{"title": "s1", "done": True}, {"title": "s2", "done": False}],
            },
        )

        row = db.query(DayTask).filter(DayTask.id == wed_id).first()
        assert row.status == 0


class TestSubtasksSyncToWeek:
    def test_subtasks_propagate_to_week_task(self, client, db, user, auth_headers):
        from db import WeekTask

        wt = _create_week_task(
            client,
            auth_headers,
            name="t",
            subtasks=[{"title": "s1"}, {"title": "s2"}],
        )
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={
                "title": "t",
                "status": 0,
                "source_week_task_id": wt["id"],
                "subtasks": [{"title": "s1", "done": True}, {"title": "s2", "done": False}],
            },
        )

        week_row = db.query(WeekTask).filter(WeekTask.id == wt["id"]).first()
        subtasks = list(week_row.subtasks or [])
        assert len(subtasks) == 2
        done_flags = {s["title"]: s["done"] for s in subtasks}
        assert done_flags == {"s1": True, "s2": False}

    def test_subtasks_propagate_to_sibling_day_tasks(self, client, db, user, auth_headers):
        """Checking a subtask in one day-instance of a multi-day week task
        should reflect on the other (pending) day-instances too — they all
        track the same underlying work."""
        from db import DayTask

        wt = _create_week_task(
            client,
            auth_headers,
            name="multi-day",
            subtasks=[{"title": "s1"}, {"title": "s2"}],
        )

        mon_id = _day_task_id(db, user.id, wt["id"], MONDAY)
        tue_id = _day_task_id(db, user.id, wt["id"], TUESDAY)
        thu_id = _day_task_id(db, user.id, wt["id"], THURSDAY)

        # Mark s1 done on Wednesday.
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)
        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={
                "title": "multi-day",
                "status": 0,
                "source_week_task_id": wt["id"],
                "subtasks": [{"title": "s1", "done": True}, {"title": "s2", "done": False}],
            },
        )

        def done_map(task_id):
            row = db.query(DayTask).filter(DayTask.id == task_id).first()
            db.refresh(row)
            return {s["title"]: s["done"] for s in (row.subtasks or [])}

        # All sibling pending day-tasks see s1 done.
        assert done_map(mon_id) == {"s1": True, "s2": False}
        assert done_map(tue_id) == {"s1": True, "s2": False}
        assert done_map(thu_id) == {"s1": True, "s2": False}

    def test_subtask_propagation_skips_completed_siblings(
        self, client, db, user, auth_headers
    ):
        """Completed day-tasks are historical — their subtask snapshot must
        survive even if a later day's subtasks get updated."""
        from db import DayTask

        wt = _create_week_task(
            client,
            auth_headers,
            name="hist",
            subtasks=[{"title": "s1"}, {"title": "s2"}],
        )

        # Manually complete Monday's day-task with its own subtask snapshot.
        mon_row = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.source_week_task_id == wt["id"],
                DayTask.day == MONDAY,
            )
            .first()
        )
        mon_row.status = 1
        mon_row.subtasks = [{"title": "s1", "done": True}, {"title": "s2", "done": True}]
        db.commit()

        # On Wednesday, change s2 back to not-done.
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)
        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={
                "title": "hist",
                "status": 0,
                "source_week_task_id": wt["id"],
                "subtasks": [{"title": "s1", "done": False}, {"title": "s2", "done": False}],
            },
        )

        db.refresh(mon_row)
        # Completed Monday keeps its historical "both done" snapshot.
        done_map = {s["title"]: s["done"] for s in mon_row.subtasks}
        assert done_map == {"s1": True, "s2": True}


class TestUncompleteRestoresFutureDays:
    def test_uncomplete_recreates_remaining_days(self, client, db, user, auth_headers):
        """After completing a week task on Wednesday (future days deleted),
        un-completing it should restore the future days within the range."""
        from db import DayTask

        wt = _create_week_task(client, auth_headers, name="t")
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        # Complete on Wednesday — future days deleted.
        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "t", "status": 1, "source_week_task_id": wt["id"]},
        )

        future = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.source_week_task_id == wt["id"],
                DayTask.day > WEDNESDAY,
            )
            .count()
        )
        assert future == 0

        # Now un-complete by setting status back to 0.
        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "t", "status": 0, "source_week_task_id": wt["id"]},
        )

        # Thu..Sun should be back.
        future_days = sorted(
            t.day
            for t in db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.source_week_task_id == wt["id"],
                DayTask.day > WEDNESDAY,
            )
            .all()
        )
        assert future_days == [THURSDAY, date(2025, 6, 6), date(2025, 6, 7), SUNDAY]

    def test_uncomplete_respects_repeat_days(self, client, db, user, auth_headers):
        """If the WeekTask uses repeat_days, restored days should follow them."""
        from db import DayTask

        # Mon/Wed/Fri only.
        wt = _create_week_task(client, auth_headers, name="t", repeat_days=[0, 2, 4])
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        # Complete on Wed.
        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "t", "status": 1, "source_week_task_id": wt["id"]},
        )
        # Un-complete.
        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "t", "status": 0, "source_week_task_id": wt["id"]},
        )

        restored = sorted(
            t.day
            for t in db.query(DayTask)
            .filter(
                DayTask.user_id == user.id,
                DayTask.source_week_task_id == wt["id"],
                DayTask.day > WEDNESDAY,
            )
            .all()
        )
        # Only Friday remains after Wednesday in the Mon/Wed/Fri pattern.
        assert restored == [date(2025, 6, 6)]
