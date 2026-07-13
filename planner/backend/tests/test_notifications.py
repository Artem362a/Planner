"""Tests for /notifications/* endpoints."""
from __future__ import annotations

from datetime import date, datetime, timedelta


class TestSendNotification:
    def test_developer_can_send_to_all(self, client, db, developer, developer_headers, user, other_user):
        from db import Notification, NotificationRecipient

        r = client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "Hello", "message": "Everyone", "audience_type": "all"},
        )
        assert r.status_code == 200

        # Scope counts to notifications authored by our test developer — the
        # dev DB has unrelated rows.
        notifs = db.query(Notification).filter(
            Notification.created_by_user_id == developer.id
        ).all()
        assert len(notifs) == 1

        recipient_count = db.query(NotificationRecipient).filter(
            NotificationRecipient.notification_id == notifs[0].id
        ).count()
        # Real "all" includes every user in the dev DB, not just our 3 fixtures.
        # At minimum it must include our 3 test users.
        assert recipient_count >= 3
        recipient_user_ids = {
            r.user_id for r in db.query(NotificationRecipient).filter(
                NotificationRecipient.notification_id == notifs[0].id
            ).all()
        }
        assert {developer.id, user.id, other_user.id}.issubset(recipient_user_ids)

    def test_regular_user_cannot_send(self, client, auth_headers, other_user):
        r = client.post(
            "/notifications/send",
            headers=auth_headers,
            json={
                "title": "x",
                "message": "y",
                "audience_type": "single",
                "user_ids": [other_user.id],
            },
        )
        assert r.status_code == 403

    def test_single_audience_requires_one_user(self, client, developer_headers, user, other_user):
        r = client.post(
            "/notifications/send",
            headers=developer_headers,
            json={
                "title": "t",
                "message": "m",
                "audience_type": "single",
                "user_ids": [user.id, other_user.id],
            },
        )
        assert r.status_code == 400

    def test_group_audience_requires_at_least_one(self, client, developer_headers):
        r = client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "t", "message": "m", "audience_type": "group", "user_ids": []},
        )
        assert r.status_code == 400

    def test_send_rejects_empty_title(self, client, developer_headers, user):
        r = client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "   ", "message": "m", "audience_type": "single", "user_ids": [user.id]},
        )
        assert r.status_code == 400

    def test_send_rejects_unknown_user_id(self, client, developer_headers):
        r = client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "t", "message": "m", "audience_type": "single", "user_ids": [99999]},
        )
        assert r.status_code == 400


class TestUnreadCount:
    def test_initial_count_is_zero(self, client, auth_headers):
        r = client.get("/notifications/unread-count", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["unread_count"] == 0

    def test_count_grows_with_new_notifications(self, client, db, user, auth_headers, developer_headers):
        client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "t", "message": "m", "audience_type": "single", "user_ids": [user.id]},
        )
        r = client.get("/notifications/unread-count", headers=auth_headers)
        assert r.json()["unread_count"] == 1

    def test_count_drops_after_mark_read(self, client, db, user, auth_headers, developer, developer_headers):
        from db import Notification

        client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "t", "message": "m", "audience_type": "single", "user_ids": [user.id]},
        )
        notif_id = db.query(Notification).filter(
            Notification.created_by_user_id == developer.id
        ).order_by(Notification.id.desc()).first().id
        client.patch(f"/notifications/{notif_id}/read", headers=auth_headers)

        r = client.get("/notifications/unread-count", headers=auth_headers)
        assert r.json()["unread_count"] == 0


class TestMarkRead:
    def test_mark_one_read(self, client, db, user, auth_headers, developer, developer_headers):
        from db import Notification, NotificationRecipient

        client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "t", "message": "m", "audience_type": "single", "user_ids": [user.id]},
        )
        notif_id = db.query(Notification).filter(
            Notification.created_by_user_id == developer.id
        ).order_by(Notification.id.desc()).first().id

        r = client.patch(f"/notifications/{notif_id}/read", headers=auth_headers)
        assert r.status_code == 200

        rec = (
            db.query(NotificationRecipient)
            .filter(NotificationRecipient.notification_id == notif_id)
            .filter(NotificationRecipient.user_id == user.id)
            .first()
        )
        assert rec.is_read is True
        assert rec.read_at is not None

    def test_mark_read_404_for_other_users_notification(
        self, client, db, user, other_user, auth_headers, developer, developer_headers
    ):
        from db import Notification

        client.post(
            "/notifications/send",
            headers=developer_headers,
            json={
                "title": "t",
                "message": "m",
                "audience_type": "single",
                "user_ids": [other_user.id],
            },
        )
        notif_id = db.query(Notification).filter(
            Notification.created_by_user_id == developer.id
        ).order_by(Notification.id.desc()).first().id

        r = client.patch(f"/notifications/{notif_id}/read", headers=auth_headers)
        assert r.status_code == 404

    def test_mark_all_read(self, client, db, user, auth_headers, developer_headers):
        for i in range(3):
            client.post(
                "/notifications/send",
                headers=developer_headers,
                json={
                    "title": f"t{i}",
                    "message": "m",
                    "audience_type": "single",
                    "user_ids": [user.id],
                },
            )

        r = client.patch("/notifications/read-all", headers=auth_headers)
        assert r.status_code == 200

        r2 = client.get("/notifications/unread-count", headers=auth_headers)
        assert r2.json()["unread_count"] == 0


class TestListNotifications:
    def test_list_shows_only_my_notifications(
        self, client, db, user, other_user, auth_headers, developer_headers
    ):
        client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "mine", "message": "m", "audience_type": "single", "user_ids": [user.id]},
        )
        client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "theirs", "message": "m", "audience_type": "single", "user_ids": [other_user.id]},
        )

        r = client.get("/notifications", headers=auth_headers)
        assert r.status_code == 200
        titles = [n["title"] for n in r.json()]
        assert "mine" in titles
        assert "theirs" not in titles

    def test_list_returns_is_read_flag(self, client, db, user, auth_headers, developer, developer_headers):
        from db import Notification

        client.post(
            "/notifications/send",
            headers=developer_headers,
            json={"title": "t", "message": "m", "audience_type": "single", "user_ids": [user.id]},
        )
        nid = db.query(Notification).filter(
            Notification.created_by_user_id == developer.id
        ).order_by(Notification.id.desc()).first().id
        client.patch(f"/notifications/{nid}/read", headers=auth_headers)

        r = client.get("/notifications", headers=auth_headers)
        body = r.json()
        # First in list is the newest — our just-sent one.
        assert body[0]["is_read"] is True


class TestOverdueReminder:
    """The /notifications/overdue-reminder endpoint generates or updates today's
    'Просроченные задачи' notification. It must:
      - not count dismissed tasks
      - count only status=0 (pending) tasks
      - count only tasks with day < today
      - dedupe — there should be only one notification per day per user.
    """

    def test_no_overdue_returns_zero(self, client, auth_headers):
        r = client.post("/notifications/overdue-reminder", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == {"created": False, "count": 0}

    def test_creates_notification_when_overdue_exists(self, client, db, user, auth_headers):
        from db import DayTask, Notification

        yesterday = date.today() - timedelta(days=1)
        db.add(DayTask(user_id=user.id, day=yesterday, title="late", priority="medium", status=0, order_index=0))
        db.commit()

        r = client.post("/notifications/overdue-reminder", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["created"] is True
        assert r.json()["count"] == 1

        notif = db.query(Notification).filter(
            Notification.created_by_user_id == user.id,
            Notification.title == "Просроченные задачи",
        ).first()
        assert notif is not None
        assert "1" in notif.message

    def test_does_not_count_dismissed(self, client, db, user, auth_headers):
        from db import DayTask

        yesterday = date.today() - timedelta(days=1)
        db.add(DayTask(user_id=user.id, day=yesterday, title="kept", priority="medium", status=0, order_index=0))
        db.add(DayTask(user_id=user.id, day=yesterday, title="dismissed", priority="medium", status=0, dismissed=True, order_index=1))
        db.commit()

        r = client.post("/notifications/overdue-reminder", headers=auth_headers)
        assert r.json()["count"] == 1

    def test_does_not_count_completed(self, client, db, user, auth_headers):
        from db import DayTask

        yesterday = date.today() - timedelta(days=1)
        db.add(DayTask(user_id=user.id, day=yesterday, title="done", priority="medium", status=1, order_index=0))
        db.commit()

        r = client.post("/notifications/overdue-reminder", headers=auth_headers)
        assert r.json()["count"] == 0

    def test_does_not_count_today_or_future(self, client, db, user, auth_headers):
        from db import DayTask

        today = date.today()
        db.add(DayTask(user_id=user.id, day=today, title="today", priority="medium", status=0, order_index=0))
        db.add(DayTask(user_id=user.id, day=today + timedelta(days=1), title="tomorrow", priority="medium", status=0, order_index=1))
        db.commit()

        r = client.post("/notifications/overdue-reminder", headers=auth_headers)
        assert r.json()["count"] == 0

    def test_second_call_updates_existing_notification(self, client, db, user, auth_headers):
        from db import DayTask, Notification

        yesterday = date.today() - timedelta(days=1)
        db.add(DayTask(user_id=user.id, day=yesterday, title="a", priority="medium", status=0, order_index=0))
        db.commit()

        def _overdue_notifs():
            return db.query(Notification).filter(
                Notification.created_by_user_id == user.id,
                Notification.title == "Просроченные задачи",
            )

        client.post("/notifications/overdue-reminder", headers=auth_headers)
        assert _overdue_notifs().count() == 1

        # Add another overdue task and call again.
        db.add(DayTask(user_id=user.id, day=yesterday, title="b", priority="medium", status=0, order_index=1))
        db.commit()

        r = client.post("/notifications/overdue-reminder", headers=auth_headers)
        body = r.json()
        assert body["count"] == 2
        assert body.get("updated") is True

        # Still only one notification — same row updated.
        assert _overdue_notifs().count() == 1
        assert "2" in _overdue_notifs().first().message

    def test_second_call_resets_is_read(self, client, db, user, auth_headers):
        from db import DayTask, Notification, NotificationRecipient

        yesterday = date.today() - timedelta(days=1)
        db.add(DayTask(user_id=user.id, day=yesterday, title="a", priority="medium", status=0, order_index=0))
        db.commit()

        client.post("/notifications/overdue-reminder", headers=auth_headers)
        notif_id = db.query(Notification).filter(
            Notification.created_by_user_id == user.id,
            Notification.title == "Просроченные задачи",
        ).first().id
        client.patch(f"/notifications/{notif_id}/read", headers=auth_headers)

        client.post("/notifications/overdue-reminder", headers=auth_headers)
        rec = db.query(NotificationRecipient).filter(
            NotificationRecipient.notification_id == notif_id,
            NotificationRecipient.user_id == user.id,
        ).first()
        assert rec.is_read is False

    def test_pluralization_in_message(self, client, db, user, auth_headers):
        from db import DayTask, Notification

        yesterday = date.today() - timedelta(days=1)
        for i in range(2):
            db.add(DayTask(user_id=user.id, day=yesterday, title=f"t{i}", priority="medium", status=0, order_index=i))
        db.commit()

        client.post("/notifications/overdue-reminder", headers=auth_headers)
        msg = db.query(Notification).filter(
            Notification.created_by_user_id == user.id,
            Notification.title == "Просроченные задачи",
        ).first().message
        assert "задачи" in msg  # 2 -> "задачи"


class TestListUsersForNotifications:
    def test_developer_can_list_users(self, client, developer_headers, user, other_user):
        r = client.get("/notifications/users", headers=developer_headers)
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert user.email in emails
        assert other_user.email in emails

    def test_regular_user_cannot_list_users(self, client, auth_headers):
        r = client.get("/notifications/users", headers=auth_headers)
        assert r.status_code == 403


class TestReminders:
    def test_create_and_list(self, client, auth_headers):
        future = (datetime.now() + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M")

        r = client.post(
            "/reminders",
            headers=auth_headers,
            json={"text": "Позвонить маме", "remind_at": future},
        )
        assert r.status_code == 200
        created = r.json()
        assert created["text"] == "Позвонить маме"
        assert created["remind_at"] == future
        assert created["sent"] is False

        listed = client.get("/reminders", headers=auth_headers).json()
        assert [x["id"] for x in listed] == [created["id"]]

    def test_create_rejects_past(self, client, auth_headers):
        past = (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")
        r = client.post(
            "/reminders",
            headers=auth_headers,
            json={"text": "поздно", "remind_at": past},
        )
        assert r.status_code == 400

    def test_create_rejects_empty_text(self, client, auth_headers):
        future = (datetime.now() + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")
        r = client.post(
            "/reminders",
            headers=auth_headers,
            json={"text": "   ", "remind_at": future},
        )
        assert r.status_code == 400

    def test_create_rejects_bad_datetime(self, client, auth_headers):
        r = client.post(
            "/reminders",
            headers=auth_headers,
            json={"text": "x", "remind_at": "not-a-date"},
        )
        assert r.status_code == 400

    def test_list_excludes_sent_and_foreign(self, client, db, user, other_user, auth_headers):
        from db import Reminder

        future = datetime.now() + timedelta(hours=3)
        db.add(Reminder(user_id=user.id, text="mine", remind_at=future))
        db.add(Reminder(user_id=user.id, text="already sent", remind_at=future, sent=True))
        db.add(Reminder(user_id=other_user.id, text="foreign", remind_at=future))
        db.commit()

        listed = client.get("/reminders", headers=auth_headers).json()
        texts = [x["text"] for x in listed]
        assert "mine" in texts
        assert "already sent" not in texts
        assert "foreign" not in texts

    def test_delete(self, client, db, user, auth_headers):
        from db import Reminder

        row = Reminder(
            user_id=user.id,
            text="удалить",
            remind_at=datetime.now() + timedelta(hours=1),
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        r = client.delete(f"/reminders/{row.id}", headers=auth_headers)
        assert r.status_code == 200

        listed = client.get("/reminders", headers=auth_headers).json()
        assert all(x["id"] != row.id for x in listed)

    def test_delete_foreign_404(self, client, db, other_user, auth_headers):
        from db import Reminder

        row = Reminder(
            user_id=other_user.id,
            text="чужое",
            remind_at=datetime.now() + timedelta(hours=1),
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        r = client.delete(f"/reminders/{row.id}", headers=auth_headers)
        assert r.status_code == 404


class TestReminderSnooze:
    def test_snooze_pending_shifts_from_remind_at(self, client, db, user, auth_headers):
        """Будущее напоминание переносится от запланированного времени."""
        from db import Reminder

        remind_at = (datetime.now() + timedelta(hours=2)).replace(second=0, microsecond=0)
        row = Reminder(user_id=user.id, text="перенести", remind_at=remind_at)
        db.add(row)
        db.commit()
        db.refresh(row)

        r = client.post(
            f"/reminders/{row.id}/snooze",
            headers=auth_headers,
            json={"minutes": 60},
        )
        assert r.status_code == 200
        body = r.json()
        expected = (remind_at + timedelta(minutes=60)).strftime("%Y-%m-%dT%H:%M")
        assert body["remind_at"] == expected
        assert body["sent"] is False

    def test_snooze_fired_counts_from_now(self, client, db, user, auth_headers):
        """Сработавшее напоминание откладывается «от сейчас» и возвращается в очередь."""
        from db import Reminder

        fired_at = datetime.now() - timedelta(minutes=30)
        row = Reminder(
            user_id=user.id,
            text="сработало",
            remind_at=fired_at,
            sent=True,
            sent_at=fired_at,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        r = client.post(
            f"/reminders/{row.id}/snooze",
            headers=auth_headers,
            json={"minutes": 10},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["sent"] is False

        new_at = datetime.strptime(body["remind_at"], "%Y-%m-%dT%H:%M")
        delta_min = (new_at - datetime.now()).total_seconds() / 60
        assert 8 <= delta_min <= 11  # ~10 минут от «сейчас», не от старого времени

        db.refresh(row)
        assert row.sent is False
        assert row.sent_at is None

        # Снова видно в списке ожидающих.
        listed = client.get("/reminders", headers=auth_headers).json()
        assert any(x["id"] == row.id for x in listed)

    def test_snooze_foreign_404(self, client, db, other_user, auth_headers):
        from db import Reminder

        row = Reminder(
            user_id=other_user.id,
            text="чужое",
            remind_at=datetime.now() + timedelta(hours=1),
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        r = client.post(
            f"/reminders/{row.id}/snooze",
            headers=auth_headers,
            json={"minutes": 10},
        )
        assert r.status_code == 404

    def test_snooze_rejects_bad_minutes(self, client, db, user, auth_headers):
        from db import Reminder

        row = Reminder(
            user_id=user.id,
            text="валидация",
            remind_at=datetime.now() + timedelta(hours=1),
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        for minutes in (0, -5, 7 * 24 * 60 + 1):
            r = client.post(
                f"/reminders/{row.id}/snooze",
                headers=auth_headers,
                json={"minutes": minutes},
            )
            assert r.status_code == 400
