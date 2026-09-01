"""SSAU ICS schedule parsing, reconciliation and API behaviour."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta


def _event(
    target_day: date,
    *,
    start: str = "094500",
    end: str = "112000",
    subject: str = "Базы данных",
    location: str = "Лекция / online",
    teacher: str = "Иванов Иван Иванович",
) -> str:
    day = target_day.strftime("%Y%m%d")
    return "\r\n".join(
        [
            "BEGIN:VEVENT",
            f"DTSTART;TZID=Europe/Samara:{day}T{start}",
            f"DTEND;TZID=Europe/Samara:{day}T{end}",
            f"SUMMARY:{subject}",
            f"DESCRIPTION:{teacher}",
            f"LOCATION:{location}",
            "END:VEVENT",
        ]
    )


def _ics(*events: str, prodid: str = "day-plan-tests") -> str:
    return "\r\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            f"PRODID:{prodid}",
            "X-WR-TIMEZONE:Europe/Samara",
            *events,
            "END:VCALENDAR",
            "",
        ]
    )


def _subscription(db, user, *, subgroup: str = "all"):
    from db import ScheduleSubscription

    row = ScheduleSubscription(
        user_id=user.id,
        feed_url="https://stud.l9labs.ru/bot/ics/test-token",
        subgroup=subgroup,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestScheduleParser:
    def test_utc_is_converted_to_samara_and_task_title_is_compact(self):
        from schedule_sync import parse_ics, task_title_for_event

        text = "\r\n".join(
            [
                "BEGIN:VCALENDAR",
                "VERSION:2.0",
                "X-WR-TIMEZONE:Europe/Samara",
                "BEGIN:VEVENT",
                "DTSTART:20260901T054500Z",
                "DTEND:20260901T072000Z",
                "SUMMARY:📚 Базы данных (1)",
                "DESCRIPTION:Агафонов Антон Александрович",
                "LOCATION:Лекция / online",
                "END:VEVENT",
                "END:VCALENDAR",
            ]
        )

        rows = parse_ics(text)

        assert len(rows) == 1
        assert rows[0].day == date(2026, 9, 1)
        assert rows[0].start_time == time(9, 45)
        assert rows[0].end_time == time(11, 20)
        assert rows[0].subject == "Базы данных"
        assert rows[0].subgroup == "1"
        assert rows[0].lesson_type == "lecture"
        assert task_title_for_event(rows[0]) == "Базы данных · онлайн"

    def test_invalid_or_untrusted_urls_are_rejected(self):
        import pytest

        from schedule_sync import ScheduleSyncError, validate_feed_url

        with pytest.raises(ScheduleSyncError):
            validate_feed_url("http://stud.l9labs.ru/bot/ics")
        with pytest.raises(ScheduleSyncError):
            validate_feed_url("https://stud.l9labs.ru.evil.example/ics")
        with pytest.raises(ScheduleSyncError):
            validate_feed_url("https://stud.l9labs.ru:abc/ics")

    def test_worker_uses_latest_due_samara_slot(self):
        from schedule_sync import SAMARA_TZ
        from schedule_worker import _scheduled_slot

        assert _scheduled_slot(datetime(2026, 9, 1, 7, 30, tzinfo=SAMARA_TZ)) == datetime(2026, 8, 31, 20)
        assert _scheduled_slot(datetime(2026, 9, 1, 8, 0, tzinfo=SAMARA_TZ)) == datetime(2026, 9, 1, 8)
        assert _scheduled_slot(datetime(2026, 9, 1, 20, 0, tzinfo=SAMARA_TZ)) == datetime(2026, 9, 1, 20)


class TestScheduleSync:
    def test_selected_subgroup_creates_ordinary_future_day_tasks(self, db, user):
        from db import DayTask, ScheduleEvent
        from schedule_sync import sync_subscription

        target = date.today() + timedelta(days=8)
        subscription = _subscription(db, user, subgroup="1")
        text = _ics(
            _event(target, subject="Общая лекция", location="Лекция / online"),
            _event(target, start="113000", end="130500", subject="Базы данных (1)", location="Лабораторная / 3а - 512"),
            _event(target, start="133000", end="150500", subject="Базы данных (2)", location="Практика / 3а-513"),
        )

        result = sync_subscription(db, subscription, ics_text=text)

        tasks = (
            db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.day == target)
            .order_by(DayTask.start_time)
            .all()
        )
        assert result["events"] == 2
        assert [task.title for task in tasks] == [
            "Общая лекция · онлайн",
            "Базы данных · 3а-512",
        ]
        assert all(task.schedule_subscription_id == subscription.id for task in tasks)
        assert db.query(ScheduleEvent).filter(ScheduleEvent.subscription_id == subscription.id).count() == 3

    def test_today_and_past_are_never_written_to_day_plan(self, db, user):
        from db import DayTask, ScheduleEvent
        from schedule_sync import sync_subscription

        subscription = _subscription(db, user)
        text = _ics(_event(date.today()), _event(date.today() - timedelta(days=1)))

        sync_subscription(db, subscription, ics_text=text)

        assert db.query(DayTask).filter(DayTask.user_id == user.id).count() == 0
        assert db.query(ScheduleEvent).filter(ScheduleEvent.subscription_id == subscription.id).count() == 2

    def test_changing_subgroup_removes_old_imports_only_on_unprotected_days(self, db, user):
        from db import DayTask
        from schedule_sync import sync_subscription

        target = date.today() + timedelta(days=9)
        subscription = _subscription(db, user, subgroup="all")
        text = _ics(
            _event(target, subject="Общая лекция"),
            _event(target, start="113000", end="130500", subject="Практика (1)", location="Практика / 310"),
            _event(target, start="133000", end="150500", subject="Практика (2)", location="Практика / 311"),
        )
        sync_subscription(db, subscription, ics_text=text)

        subscription.subgroup = "1"
        subscription.last_content_hash = None
        db.commit()
        sync_subscription(db, subscription, ics_text=text)

        titles = [
            row.title
            for row in db.query(DayTask)
            .filter(DayTask.user_id == user.id, DayTask.day == target)
            .order_by(DayTask.start_time)
            .all()
        ]
        assert titles == ["Общая лекция · онлайн", "Практика · 310"]

    def test_manual_edit_freezes_whole_day_and_source_change_notifies(self, client, db, user, auth_headers):
        from db import DayTask, Notification, NotificationRecipient, ScheduleEvent
        from schedule_sync import sync_subscription

        target = date.today() + timedelta(days=10)
        subscription = _subscription(db, user)
        first = _ics(_event(target, location="Лекция / 3а-512"))
        sync_subscription(db, subscription, ics_text=first)
        task = db.query(DayTask).filter(DayTask.user_id == user.id, DayTask.day == target).one()

        response = client.patch(
            f"/day/{target.isoformat()}/tasks/{task.id}",
            headers=auth_headers,
            json={"title": "Пара отменена"},
        )
        assert response.status_code == 200

        second = _ics(_event(target, location="Лекция / 3а-514"), prodid="changed")
        result = sync_subscription(db, subscription, ics_text=second)

        db.expire_all()
        task = db.query(DayTask).filter(DayTask.id == task.id).one()
        event = db.query(ScheduleEvent).filter(ScheduleEvent.subscription_id == subscription.id).one()
        notification = (
            db.query(Notification)
            .filter(Notification.created_by_user_id == user.id, Notification.title == "Расписание изменилось")
            .one()
        )
        assert result["protected_days"] == 1
        assert task.title == "Пара отменена"
        assert event.location == "Лекция / 3а-514"
        assert db.query(NotificationRecipient).filter(
            NotificationRecipient.notification_id == notification.id,
            NotificationRecipient.user_id == user.id,
        ).count() == 1

    def test_deleted_imported_task_does_not_reappear(self, client, db, user, auth_headers):
        from db import DayTask
        from schedule_sync import sync_subscription

        target = date.today() + timedelta(days=12)
        subscription = _subscription(db, user)
        original = _ics(_event(target))
        sync_subscription(db, subscription, ics_text=original)
        task = db.query(DayTask).filter(DayTask.user_id == user.id, DayTask.day == target).one()

        response = client.delete(
            f"/day/{target.isoformat()}/tasks/{task.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        sync_subscription(db, subscription, ics_text=_ics(_event(target), prodid="new-revision"))

        assert db.query(DayTask).filter(DayTask.user_id == user.id, DayTask.day == target).count() == 0


class TestScheduleApi:
    def test_settings_are_available_without_ssau_email(self, client, auth_headers):
        response = client.get("/schedule/subscription", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["connected"] is False
        assert response.json()["auto_sync_times"] == ["08:00", "20:00"]

    def test_disconnect_can_keep_imported_tasks(self, client, db, user, auth_headers):
        from db import DayTask, ScheduleSubscription

        target = date.today() + timedelta(days=8)
        subscription = _subscription(db, user)
        subscription_id = subscription.id
        task = DayTask(
            user_id=user.id,
            day=target,
            title="Базы данных · онлайн",
            priority="medium",
            status=0,
            order_index=0,
            schedule_subscription_id=subscription.id,
            schedule_event_key="event-1",
            schedule_lesson_type="lecture",
        )
        db.add(task)
        db.commit()
        task_id = task.id

        response = client.delete("/schedule/subscription", headers=auth_headers)

        assert response.status_code == 200
        db.expire_all()
        kept = db.query(DayTask).filter(DayTask.id == task_id).one()
        assert kept.schedule_subscription_id is None
        assert kept.schedule_event_key is None
        assert db.query(ScheduleSubscription).filter(ScheduleSubscription.id == subscription_id).count() == 0

    def test_disconnect_removes_only_future_unprotected_imports(
        self,
        client,
        db,
        user,
        auth_headers,
    ):
        from db import DaySettings, DayTask

        removable_day = date.today() + timedelta(days=8)
        protected_day = date.today() + timedelta(days=9)
        subscription = _subscription(db, user)
        removable = DayTask(
            user_id=user.id,
            day=removable_day,
            title="Удалить",
            priority="medium",
            status=0,
            order_index=0,
            schedule_subscription_id=subscription.id,
            schedule_event_key="event-remove",
            schedule_lesson_type="lecture",
        )
        protected = DayTask(
            user_id=user.id,
            day=protected_day,
            title="Сохранить изменённый план",
            priority="medium",
            status=0,
            order_index=0,
            schedule_subscription_id=subscription.id,
            schedule_event_key="event-keep",
            schedule_lesson_type="lab",
        )
        today_task = DayTask(
            user_id=user.id,
            day=date.today(),
            title="Сохранить сегодня",
            priority="medium",
            status=0,
            order_index=0,
            schedule_subscription_id=subscription.id,
            schedule_event_key="event-today",
            schedule_lesson_type="practice",
        )
        db.add_all(
            [
                removable,
                protected,
                today_task,
                DaySettings(user_id=user.id, day=protected_day, plan_locked=True),
            ]
        )
        db.commit()
        removable_id = removable.id
        protected_id = protected.id
        today_id = today_task.id

        response = client.delete(
            "/schedule/subscription?remove_future_tasks=true",
            headers=auth_headers,
        )

        assert response.status_code == 200
        db.expire_all()
        assert db.query(DayTask).filter(DayTask.id == removable_id).count() == 0
        for kept_id in (protected_id, today_id):
            kept = db.query(DayTask).filter(DayTask.id == kept_id).one()
            assert kept.schedule_subscription_id is None
            assert kept.schedule_event_key is None

    def test_week_view_is_separate_and_filterable(self, client, db, user, auth_headers):
        from schedule_sync import sync_subscription

        monday = date.today() + timedelta(days=(7 - date.today().weekday()))
        subscription = _subscription(db, user)
        sync_subscription(
            db,
            subscription,
            ics_text=_ics(
                _event(monday, subject="Алгебра", location="Лекция / online"),
                _event(
                    monday + timedelta(days=1),
                    subject="Базы данных",
                    location="Лабораторная / 3а-512",
                ),
            ),
            now=datetime.combine(date.today(), time(12, 0)),
        )

        response = client.get(
            f"/schedule/week?week_start={monday.isoformat()}&lesson_type=lab",
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["connected"] is True
        assert [event["subject"] for event in body["events"]] == ["Базы данных"]
