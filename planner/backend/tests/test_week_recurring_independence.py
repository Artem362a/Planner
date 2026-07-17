"""Recurring недельные задачи: каждый день — независимое повторение.

В отличие от обычных многодневных задач (см. test_day_week_sync.py), у
task_type='recurring' отметка одного дня НЕ должна каскадом трогать соседние
дни, статус недельной задачи или подзадачи других дней. Авто-выполнение дня
по своим же подзадачам при этом остаётся (чисто локальная логика).
"""
from __future__ import annotations

from datetime import date


MONDAY = date(2025, 6, 2)
WEDNESDAY = date(2025, 6, 4)
FRIDAY = date(2025, 6, 6)
SUNDAY = date(2025, 6, 8)


def _create_recurring_week_task(client, headers, **overrides):
    payload = {
        "name": "wt",
        "start_date": MONDAY.isoformat(),
        "end_date": SUNDAY.isoformat(),
        "important": False,
        "status": 0,
        "task_type": "recurring",
        "repeat_days": [0, 2, 4],  # Mon/Wed/Fri
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


class TestRecurringCompleteDoesNotCascade:
    def test_complete_wed_leaves_mon_untouched(self, client, db, user, auth_headers):
        from db import DayTask

        wt = _create_recurring_week_task(client, auth_headers, name="gym")
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "gym", "status": 1, "source_week_task_id": wt["id"]},
        )

        mon = db.query(DayTask).filter(
            DayTask.user_id == user.id,
            DayTask.source_week_task_id == wt["id"],
            DayTask.day == MONDAY,
        ).first()
        assert mon.status == 0

    def test_complete_wed_does_not_delete_future_fri(self, client, db, user, auth_headers):
        from db import DayTask

        wt = _create_recurring_week_task(client, auth_headers, name="gym")
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "gym", "status": 1, "source_week_task_id": wt["id"]},
        )

        fri = db.query(DayTask).filter(
            DayTask.user_id == user.id,
            DayTask.source_week_task_id == wt["id"],
            DayTask.day == FRIDAY,
        ).first()
        assert fri is not None
        assert fri.status == 0

    def test_complete_one_day_does_not_flip_week_task_status(self, client, db, user, auth_headers):
        from db import WeekTask

        wt = _create_recurring_week_task(client, auth_headers, name="gym")
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "gym", "status": 1, "source_week_task_id": wt["id"]},
        )

        week_row = db.query(WeekTask).filter(WeekTask.id == wt["id"]).first()
        assert week_row.status == 0

    def test_all_three_days_independent(self, client, db, user, auth_headers):
        """Отмечаем Пн и Пт, Ср остаётся нетронутой — независимая матрица."""
        from db import DayTask

        wt = _create_recurring_week_task(client, auth_headers, name="gym")
        mon_id = _day_task_id(db, user.id, wt["id"], MONDAY)
        fri_id = _day_task_id(db, user.id, wt["id"], FRIDAY)

        for day, task_id in [(MONDAY, mon_id), (FRIDAY, fri_id)]:
            client.patch(
                f"/day/{day.isoformat()}/tasks/{task_id}",
                headers=auth_headers,
                json={"title": "gym", "status": 1, "source_week_task_id": wt["id"]},
            )

        wed = db.query(DayTask).filter(
            DayTask.user_id == user.id,
            DayTask.source_week_task_id == wt["id"],
            DayTask.day == WEDNESDAY,
        ).first()
        mon = db.query(DayTask).filter(DayTask.id == mon_id).first()
        fri = db.query(DayTask).filter(DayTask.id == fri_id).first()

        assert mon.status == 1
        assert fri.status == 1
        assert wed.status == 0


class TestRecurringSubtasksDoNotCascade:
    def test_subtask_toggle_does_not_propagate_to_siblings(self, client, db, user, auth_headers):
        wt = _create_recurring_week_task(
            client, auth_headers, name="routine",
            subtasks=[{"title": "s1"}, {"title": "s2"}],
        )
        mon_id = _day_task_id(db, user.id, wt["id"], MONDAY)
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={
                "title": "routine",
                "status": 0,
                "source_week_task_id": wt["id"],
                "subtasks": [{"title": "s1", "done": True}, {"title": "s2", "done": False}],
            },
        )

        from db import DayTask
        mon = db.query(DayTask).filter(DayTask.id == mon_id).first()
        done_map = {s["title"]: s["done"] for s in (mon.subtasks or [])}
        # Понедельник не тронут — там ещё исходный (недоделанный) шаблон.
        assert done_map == {"s1": False, "s2": False}

    def test_subtask_toggle_does_not_sync_to_week_task_template(self, client, db, user, auth_headers):
        wt = _create_recurring_week_task(
            client, auth_headers, name="routine",
            subtasks=[{"title": "s1"}, {"title": "s2"}],
        )
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={
                "title": "routine",
                "status": 0,
                "source_week_task_id": wt["id"],
                "subtasks": [{"title": "s1", "done": True}, {"title": "s2", "done": False}],
            },
        )

        from db import WeekTask
        week_row = db.query(WeekTask).filter(WeekTask.id == wt["id"]).first()
        done_map = {s["title"]: s["done"] for s in (week_row.subtasks or [])}
        # Шаблон недельной задачи не меняется правкой конкретного дня.
        assert done_map == {"s1": False, "s2": False}

    def test_all_subtasks_done_still_auto_completes_that_day(self, client, db, user, auth_headers):
        """Локальное авто-выполнение по своим подзадачам остаётся и для recurring."""
        wt = _create_recurring_week_task(
            client, auth_headers, name="routine",
            subtasks=[{"title": "s1"}, {"title": "s2"}],
        )
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={
                "title": "routine",
                "status": 0,
                "source_week_task_id": wt["id"],
                "subtasks": [{"title": "s1", "done": True}, {"title": "s2", "done": True}],
            },
        )

        from db import DayTask
        wed = db.query(DayTask).filter(DayTask.id == wed_id).first()
        assert wed.status == 1

        # Соседний день (Пятница) не выполнен и не в курсе про подзадачи Ср.
        fri_id = _day_task_id(db, user.id, wt["id"], FRIDAY)
        fri = db.query(DayTask).filter(DayTask.id == fri_id).first()
        assert fri.status == 0
        assert {s["title"]: s["done"] for s in (fri.subtasks or [])} == {
            "s1": False,
            "s2": False,
        }


class TestWeekTasksDayStatus:
    def test_day_status_reflects_each_day(self, client, db, user, auth_headers):
        wt = _create_recurring_week_task(client, auth_headers, name="gym")
        wed_id = _day_task_id(db, user.id, wt["id"], WEDNESDAY)

        client.patch(
            f"/day/{WEDNESDAY.isoformat()}/tasks/{wed_id}",
            headers=auth_headers,
            json={"title": "gym", "status": 1, "source_week_task_id": wt["id"]},
        )

        r = client.get(
            "/week-tasks", headers=auth_headers, params={"week_start": MONDAY.isoformat()}
        )
        assert r.status_code == 200
        row = next(t for t in r.json() if t["id"] == wt["id"])

        assert row["day_status"][MONDAY.isoformat()] == 0
        assert row["day_status"][WEDNESDAY.isoformat()] == 1
        assert row["day_status"][FRIDAY.isoformat()] == 0

    def test_week_status_marks_all_days_done(self, client, db, user, auth_headers):
        """Чекбокс недели: один запрос закрывает все дни recurring-задачи."""
        wt = _create_recurring_week_task(client, auth_headers, name="gym")

        r = client.put(
            f"/week-tasks/{wt['id']}/week-status",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat(), "status": 1},
        )
        assert r.status_code == 200
        assert r.json()["day_status"] == {
            MONDAY.isoformat(): 1,
            WEDNESDAY.isoformat(): 1,
            FRIDAY.isoformat(): 1,
        }

        # Статус самой недельной задачи не тронут: 1 значил бы «повтор остановлен».
        from db import WeekTask
        assert db.query(WeekTask).filter(WeekTask.id == wt["id"]).first().status == 0

    def test_week_status_unmarks_all_days(self, client, db, user, auth_headers):
        wt = _create_recurring_week_task(client, auth_headers, name="gym")

        client.put(
            f"/week-tasks/{wt['id']}/week-status",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat(), "status": 1},
        )
        r = client.put(
            f"/week-tasks/{wt['id']}/week-status",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat(), "status": 0},
        )
        assert r.status_code == 200
        assert set(r.json()["day_status"].values()) == {0}

    def test_week_status_creates_missing_day_tasks(self, client, db, user, auth_headers):
        """Если DayTask какого-то дня ещё не создан, он появляется сразу выполненным."""
        from db import DayTask

        wt = _create_recurring_week_task(client, auth_headers, name="gym")
        mon_id = _day_task_id(db, user.id, wt["id"], MONDAY)
        db.query(DayTask).filter(DayTask.id == mon_id).delete()
        db.commit()

        r = client.put(
            f"/week-tasks/{wt['id']}/week-status",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat(), "status": 1},
        )
        assert r.status_code == 200
        assert r.json()["day_status"][MONDAY.isoformat()] == 1

    def test_week_status_rejected_for_normal_tasks(self, client, auth_headers):
        payload = {
            "name": "normal task",
            "start_date": MONDAY.isoformat(),
            "end_date": SUNDAY.isoformat(),
            "important": False,
            "status": 0,
            "task_type": "normal",
            "repeat_days": [],
            "subtasks": [],
        }
        wt = client.post("/week-tasks", headers=auth_headers, json=payload).json()

        r = client.put(
            f"/week-tasks/{wt['id']}/week-status",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat(), "status": 1},
        )
        assert r.status_code == 400

    def test_important_list_hides_recurring_with_week_fully_done(
        self, client, db, user, auth_headers
    ):
        """Виджет «Расписание на неделю» показывает важные задачи; recurring
        с полностью закрытой неделей должна из него пропадать."""
        wt = _create_recurring_week_task(client, auth_headers, name="gym", important=True)

        def important_ids():
            r = client.get(
                "/week-tasks/important",
                headers=auth_headers,
                params={"week_start": MONDAY.isoformat()},
            )
            assert r.status_code == 200
            return [t["id"] for t in r.json()]

        assert wt["id"] in important_ids()

        client.put(
            f"/week-tasks/{wt['id']}/week-status",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat(), "status": 1},
        )
        assert wt["id"] not in important_ids()

        # Частично выполненная неделя — снова видна.
        client.put(
            f"/week-tasks/{wt['id']}/week-status",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat(), "status": 0},
        )
        assert wt["id"] in important_ids()

    def test_day_status_empty_for_normal_tasks(self, client, auth_headers):
        payload = {
            "name": "normal task",
            "start_date": MONDAY.isoformat(),
            "end_date": SUNDAY.isoformat(),
            "important": False,
            "status": 0,
            "task_type": "normal",
            "repeat_days": [],
            "subtasks": [],
        }
        client.post("/week-tasks", headers=auth_headers, json=payload)

        r = client.get(
            "/week-tasks", headers=auth_headers, params={"week_start": MONDAY.isoformat()}
        )
        row = next(t for t in r.json() if t["name"] == "normal task")
        assert row["day_status"] == {}
