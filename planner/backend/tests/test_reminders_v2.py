"""Тесты фич напоминаний v2: повторяемость, ответы (ack), напоминания-от-задач,
настройки напоминаний пользователя."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from db import DayTask, Reminder
from reminder_rules import add_interval, next_occurrence


class TestReminderRules:
    def test_add_interval_units(self):
        base = datetime(2026, 7, 14, 9, 0)
        assert add_interval(base, 3, "day") == datetime(2026, 7, 17, 9, 0)
        assert add_interval(base, 2, "week") == datetime(2026, 7, 28, 9, 0)
        assert add_interval(base, 1, "month") == datetime(2026, 8, 14, 9, 0)

    def test_add_interval_month_clamps_to_month_end(self):
        assert add_interval(datetime(2026, 1, 31, 9, 0), 1, "month") == datetime(2026, 2, 28, 9, 0)
        assert add_interval(datetime(2024, 1, 31, 9, 0), 1, "month") == datetime(2024, 2, 29, 9, 0)

    def test_next_occurrence_skips_missed_cycles(self):
        base = datetime(2026, 7, 1, 9, 0)
        now = datetime(2026, 7, 14, 12, 0)
        assert next_occurrence(base, 1, "day", now) == datetime(2026, 7, 15, 9, 0)
        assert next_occurrence(base, 1, "week", now) == datetime(2026, 7, 15, 9, 0)


class TestRecurringReminders:
    def test_create_with_recurrence(self, client, auth_headers):
        future = (datetime.now() + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M")
        r = client.post(
            "/reminders",
            headers=auth_headers,
            json={"text": "зарядка", "remind_at": future, "recur_every": 2, "recur_unit": "day"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["recur_every"] == 2
        assert body["recur_unit"] == "day"

    def test_create_rejects_half_recurrence(self, client, auth_headers):
        future = (datetime.now() + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M")
        r = client.post(
            "/reminders",
            headers=auth_headers,
            json={"text": "x", "remind_at": future, "recur_every": 2},
        )
        assert r.status_code == 400

    def test_create_rejects_bad_every(self, client, auth_headers):
        future = (datetime.now() + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M")
        for every in (0, -1, 366):
            r = client.post(
                "/reminders",
                headers=auth_headers,
                json={"text": "x", "remind_at": future, "recur_every": every, "recur_unit": "day"},
            )
            assert r.status_code == 400

    def test_ack_reschedules_recurring(self, client, db, user, auth_headers):
        """Ответ на повторяющееся напоминание планирует следующее срабатывание."""
        fired_at = (datetime.now() - timedelta(minutes=10)).replace(second=0, microsecond=0)
        row = Reminder(
            user_id=user.id,
            text="каждый день",
            remind_at=fired_at,
            sent=True,
            sent_at=fired_at,
            recur_every=1,
            recur_unit="day",
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        r = client.post(
            f"/reminders/{row.id}/ack",
            headers=auth_headers,
            json={"status": "done"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["sent"] is False
        assert body["ack"] is None
        expected = (fired_at + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M")
        assert body["remind_at"] == expected

        # Снова в списке ожидающих.
        listed = client.get("/reminders", headers=auth_headers).json()
        assert any(x["id"] == row.id for x in listed)


class TestReminderAck:
    def _fired(self, db, user, **extra):
        fired_at = datetime.now() - timedelta(minutes=5)
        row = Reminder(
            user_id=user.id,
            text="сработало",
            remind_at=fired_at,
            sent=True,
            sent_at=fired_at,
            **extra,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def test_ack_done(self, client, db, user, auth_headers):
        row = self._fired(db, user)
        r = client.post(
            f"/reminders/{row.id}/ack", headers=auth_headers, json={"status": "done"}
        )
        assert r.status_code == 200
        assert r.json()["ack"] == "done"

    def test_ack_read(self, client, db, user, auth_headers):
        row = self._fired(db, user)
        r = client.post(
            f"/reminders/{row.id}/ack", headers=auth_headers, json={"status": "read"}
        )
        assert r.status_code == 200
        assert r.json()["ack"] == "read"

    def test_ack_pending_400(self, client, db, user, auth_headers):
        row = Reminder(
            user_id=user.id, text="ещё не сработало", remind_at=datetime.now() + timedelta(hours=1)
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        r = client.post(
            f"/reminders/{row.id}/ack", headers=auth_headers, json={"status": "done"}
        )
        assert r.status_code == 400

    def test_ack_foreign_404(self, client, db, other_user, auth_headers):
        row = self._fired(db, other_user)
        r = client.post(
            f"/reminders/{row.id}/ack", headers=auth_headers, json={"status": "done"}
        )
        assert r.status_code == 404

    def test_ack_done_completes_source_task(self, client, db, user, auth_headers):
        """«Сделано» у напоминания-от-задачи отмечает задачу выполненной."""
        task = DayTask(user_id=user.id, day=date.today(), title="Позвонить", status=0)
        db.add(task)
        db.commit()
        db.refresh(task)

        row = self._fired(db, user, kind="task", source_task_id=task.id)
        r = client.post(
            f"/reminders/{row.id}/ack", headers=auth_headers, json={"status": "done"}
        )
        assert r.status_code == 200

        db.refresh(task)
        assert task.status == 1


class TestTaskReminderSync:
    def _tomorrow(self) -> str:
        return (date.today() + timedelta(days=1)).isoformat()

    def _task_reminder(self, db, task_id):
        return db.query(Reminder).filter(Reminder.source_task_id == task_id).first()

    def test_create_task_with_reminder(self, client, db, auth_headers):
        day = self._tomorrow()
        r = client.post(
            f"/day/{day}/tasks",
            headers=auth_headers,
            json={"title": "Созвон", "start_time": "12:00", "remind_lead_min": 15},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["remind_lead_min"] == 15

        rem = self._task_reminder(db, body["id"])
        assert rem is not None
        assert rem.kind == "task"
        assert rem.remind_at == datetime.fromisoformat(f"{day}T11:45")
        assert "Созвон" in rem.text

    def test_update_task_time_moves_reminder(self, client, db, auth_headers):
        day = self._tomorrow()
        created = client.post(
            f"/day/{day}/tasks",
            headers=auth_headers,
            json={"title": "Созвон", "start_time": "12:00", "remind_lead_min": 15},
        ).json()

        r = client.patch(
            f"/day/{day}/tasks/{created['id']}",
            headers=auth_headers,
            json={"title": "Созвон", "start_time": "18:00"},
        )
        assert r.status_code == 200

        rem = self._task_reminder(db, created["id"])
        assert rem is not None
        assert rem.remind_at == datetime.fromisoformat(f"{day}T17:45")

    def test_negative_lead_removes_reminder(self, client, db, auth_headers):
        day = self._tomorrow()
        created = client.post(
            f"/day/{day}/tasks",
            headers=auth_headers,
            json={"title": "Созвон", "start_time": "12:00", "remind_lead_min": 15},
        ).json()
        assert self._task_reminder(db, created["id"]) is not None

        r = client.patch(
            f"/day/{day}/tasks/{created['id']}",
            headers=auth_headers,
            json={"title": "Созвон", "remind_lead_min": -1},
        )
        assert r.status_code == 200
        assert r.json()["remind_lead_min"] is None
        assert self._task_reminder(db, created["id"]) is None

    def test_done_task_removes_reminder(self, client, db, auth_headers):
        day = self._tomorrow()
        created = client.post(
            f"/day/{day}/tasks",
            headers=auth_headers,
            json={"title": "Созвон", "start_time": "12:00", "remind_lead_min": 15},
        ).json()

        r = client.patch(
            f"/day/{day}/tasks/{created['id']}",
            headers=auth_headers,
            json={"title": "Созвон", "status": 1},
        )
        assert r.status_code == 200
        assert self._task_reminder(db, created["id"]) is None

    def test_delete_task_cascades_reminder(self, client, db, auth_headers):
        day = self._tomorrow()
        created = client.post(
            f"/day/{day}/tasks",
            headers=auth_headers,
            json={"title": "Созвон", "start_time": "12:00", "remind_lead_min": 15},
        ).json()

        r = client.delete(f"/day/{day}/tasks/{created['id']}", headers=auth_headers)
        assert r.status_code == 200
        db.expire_all()
        assert self._task_reminder(db, created["id"]) is None

    def test_past_remind_time_not_created(self, client, db, auth_headers):
        """Время напоминания уже прошло — напоминание не создаётся."""
        today = date.today().isoformat()
        r = client.post(
            f"/day/{today}/tasks",
            headers=auth_headers,
            json={"title": "Прошлое", "start_time": "00:00", "remind_lead_min": 5},
        )
        assert r.status_code == 200
        assert self._task_reminder(db, r.json()["id"]) is None


class TestReminderSettings:
    def test_update_and_read_back(self, client, auth_headers):
        r = client.patch(
            "/auth/reminder-settings",
            headers=auth_headers,
            json={
                "task_reminder_lead_min": 20,
                "reminder_repeat_min": 45,
                "reminder_repeat_max": 5,
                "goal_deadline_days": 7,
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["task_reminder_lead_min"] == 20
        assert body["reminder_repeat_min"] == 45
        assert body["reminder_repeat_max"] == 5
        assert body["goal_deadline_days"] == 7

        me = client.get("/auth/me", headers=auth_headers).json()
        assert me["task_reminder_lead_min"] == 20
        assert me["goal_deadline_days"] == 7

    def test_defaults_in_me(self, client, auth_headers):
        me = client.get("/auth/me", headers=auth_headers).json()
        assert me["task_reminder_lead_min"] == 10
        assert me["reminder_repeat_min"] == 30
        assert me["reminder_repeat_max"] == 3
        assert me["goal_deadline_days"] == 3

    def test_rejects_out_of_range(self, client, auth_headers):
        base = {
            "task_reminder_lead_min": 10,
            "reminder_repeat_min": 30,
            "reminder_repeat_max": 3,
            "goal_deadline_days": 3,
        }
        for field, bad in [
            ("task_reminder_lead_min", -1),
            ("reminder_repeat_min", 100000),
            ("reminder_repeat_max", 11),
            ("goal_deadline_days", 61),
        ]:
            r = client.patch(
                "/auth/reminder-settings",
                headers=auth_headers,
                json={**base, field: bad},
            )
            assert r.status_code == 400, field
