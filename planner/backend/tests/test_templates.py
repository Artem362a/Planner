"""Tests for /day-templates/* and /week-templates/* endpoints."""
from __future__ import annotations

from datetime import date


TODAY = date.today().isoformat()
MONDAY = date(2025, 6, 2)


# ---- Day templates ----


class TestDayTemplates:
    def test_create_and_list(self, client, auth_headers):
        body = {
            "name": "Morning routine",
            "color": "#abc123",
            "tasks": [
                {"title": "Wake up", "start_time": "07:00", "priority": "high"},
                {"title": "Coffee", "priority": "medium"},
            ],
        }
        r = client.post("/day-templates", headers=auth_headers, json=body)
        assert r.status_code == 200
        created = r.json()
        assert created["name"] == "Morning routine"
        assert len(created["tasks"]) == 2

        listed = client.get("/day-templates", headers=auth_headers).json()
        assert any(t["id"] == created["id"] for t in listed)

    def test_list_filters_by_user(self, client, db, user, other_user, auth_headers):
        from db import DayTemplate

        db.add(DayTemplate(user_id=user.id, name="mine", color="#fff", tasks_json=[]))
        db.add(DayTemplate(user_id=other_user.id, name="theirs", color="#fff", tasks_json=[]))
        db.commit()

        names = [t["name"] for t in client.get("/day-templates", headers=auth_headers).json()]
        assert "mine" in names
        assert "theirs" not in names

    def test_delete(self, client, db, user, auth_headers):
        from db import DayTemplate

        t = DayTemplate(user_id=user.id, name="x", color="#fff", tasks_json=[])
        db.add(t)
        db.commit()
        db.refresh(t)

        r = client.delete(f"/day-templates/{t.id}", headers=auth_headers)
        assert r.status_code == 200

        assert db.query(DayTemplate).filter(DayTemplate.id == t.id).first() is None

    def test_delete_404(self, client, auth_headers):
        r = client.delete("/day-templates/99999", headers=auth_headers)
        assert r.status_code == 404


class TestApplyDayTemplate:
    def test_apply_creates_day_tasks(self, client, db, user, auth_headers):
        from db import DayTask

        body = {
            "name": "tpl",
            "color": "#abc",
            "tasks": [
                {"title": "A", "start_time": "08:00", "priority": "high", "duration_min": 30},
                {"title": "B", "priority": "medium"},
                {"title": "C", "category": "home"},
            ],
        }
        tpl = client.post("/day-templates", headers=auth_headers, json=body).json()

        r = client.post(
            f"/day-templates/{tpl['id']}/apply/{TODAY}",
            headers=auth_headers,
        )
        assert r.status_code == 200
        out = r.json()
        assert len(out) == 3
        assert [t["title"] for t in out] == ["A", "B", "C"]

        # Order indices are sequential.
        order_indices = sorted(t["order_index"] for t in out)
        assert order_indices == [0, 1, 2]

        # Tasks really landed in the day.
        from datetime import date as _date
        d = _date.fromisoformat(TODAY)
        assert db.query(DayTask).filter(
            DayTask.user_id == user.id, DayTask.day == d
        ).count() == 3

    def test_apply_appends_to_existing_day(self, client, auth_headers):
        # Existing task on the day.
        client.post(f"/day/{TODAY}/tasks", headers=auth_headers, json={"title": "existing"})

        tpl = client.post(
            "/day-templates",
            headers=auth_headers,
            json={"name": "tpl", "color": "#abc", "tasks": [{"title": "from-tpl"}]},
        ).json()

        client.post(f"/day-templates/{tpl['id']}/apply/{TODAY}", headers=auth_headers)

        titles = [t["title"] for t in client.get(f"/day/{TODAY}", headers=auth_headers).json()]
        assert titles == ["existing", "from-tpl"]

    def test_apply_404_for_unknown_template(self, client, auth_headers):
        r = client.post(f"/day-templates/99999/apply/{TODAY}", headers=auth_headers)
        assert r.status_code == 404

    def test_apply_bad_date(self, client, auth_headers):
        tpl = client.post(
            "/day-templates",
            headers=auth_headers,
            json={"name": "tpl", "color": "#abc", "tasks": []},
        ).json()

        r = client.post(f"/day-templates/{tpl['id']}/apply/bad-date", headers=auth_headers)
        assert r.status_code == 400


# ---- Week templates ----


class TestWeekTemplates:
    def test_create_and_list(self, client, auth_headers):
        body = {
            "name": "Standard week",
            "color": "#abc123",
            "tasks": [
                {"name": "task A", "start_offset": 0, "end_offset": 6, "important": True},
                {"name": "task B", "start_offset": 1, "end_offset": 1, "category": "home"},
            ],
        }
        r = client.post("/week-templates", headers=auth_headers, json=body)
        assert r.status_code == 200
        assert len(r.json()["tasks"]) == 2

    def test_delete(self, client, db, user, auth_headers):
        from db import WeekTemplate

        t = WeekTemplate(user_id=user.id, name="x", color="#fff", tasks_json=[])
        db.add(t)
        db.commit()
        db.refresh(t)

        r = client.delete(f"/week-templates/{t.id}", headers=auth_headers)
        assert r.status_code == 200

    def test_patch_updates_name_and_color(self, client, auth_headers):
        body = {
            "name": "Old name",
            "color": "#abc123",
            "tasks": [{"name": "task A", "start_offset": 0, "end_offset": 6}],
        }
        tpl = client.post("/week-templates", headers=auth_headers, json=body).json()

        r = client.patch(
            f"/week-templates/{tpl['id']}",
            headers=auth_headers,
            json={"name": "New name", "color": "#ff0000"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "New name"
        assert data["color"] == "#ff0000"
        # tasks не трогали — остаются на месте
        assert len(data["tasks"]) == 1

    def test_patch_replaces_tasks(self, client, auth_headers):
        body = {
            "name": "Tpl",
            "color": "#abc123",
            "tasks": [{"name": "task A", "start_offset": 0, "end_offset": 0}],
        }
        tpl = client.post("/week-templates", headers=auth_headers, json=body).json()

        r = client.patch(
            f"/week-templates/{tpl['id']}",
            headers=auth_headers,
            json={
                "tasks": [
                    {"name": "B", "start_offset": 1, "end_offset": 2},
                    {"name": "C", "start_offset": 3, "end_offset": 3},
                ]
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Tpl"  # без изменений
        assert [t["name"] for t in data["tasks"]] == ["B", "C"]

    def test_patch_404_for_unknown(self, client, auth_headers):
        r = client.patch(
            "/week-templates/99999", headers=auth_headers, json={"name": "x"}
        )
        assert r.status_code == 404

    def test_patch_other_users_template_404(
        self, client, db, other_user, auth_headers
    ):
        from db import WeekTemplate

        t = WeekTemplate(user_id=other_user.id, name="x", color="#fff", tasks_json=[])
        db.add(t)
        db.commit()
        db.refresh(t)

        r = client.patch(
            f"/week-templates/{t.id}", headers=auth_headers, json={"name": "hacked"}
        )
        assert r.status_code == 404


class TestApplyWeekTemplate:
    def test_apply_with_offsets(self, client, db, user, auth_headers):
        from db import WeekTask

        # Mon..Sun span and a single-day task on the Monday.
        body = {
            "name": "tpl",
            "color": "#abc",
            "tasks": [
                {"name": "all week", "start_offset": 0, "end_offset": 6, "important": True},
                {"name": "mon only", "start_offset": 0, "end_offset": 0},
            ],
        }
        tpl = client.post("/week-templates", headers=auth_headers, json=body).json()

        r = client.post(
            f"/week-templates/{tpl['id']}/apply",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat()},
        )
        assert r.status_code == 200
        out = r.json()
        assert len(out) == 2

        by_name = {t["name"]: t for t in out}
        assert by_name["all week"]["start_date"] == MONDAY.isoformat()
        assert by_name["all week"]["end_date"] == "2025-06-08"
        assert by_name["all week"]["important"] is True

        assert by_name["mon only"]["start_date"] == MONDAY.isoformat()
        assert by_name["mon only"]["end_date"] == MONDAY.isoformat()

        # WeekTasks really persisted.
        assert db.query(WeekTask).filter(
            WeekTask.user_id == user.id,
            WeekTask.start_date == MONDAY,
        ).count() == 2

    def test_apply_auto_creates_day_tasks(self, client, db, user, auth_headers):
        """Применение недельного шаблона должно сразу заводить задачи в днях."""
        from db import DayTask

        body = {
            "name": "tpl",
            "color": "#abc",
            "tasks": [{"name": "mon only", "start_offset": 0, "end_offset": 0}],
        }
        tpl = client.post("/week-templates", headers=auth_headers, json=body).json()

        r = client.post(
            f"/week-templates/{tpl['id']}/apply",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat()},
        )
        assert r.status_code == 200

        day_tasks = db.query(DayTask).filter(
            DayTask.user_id == user.id,
            DayTask.day == MONDAY,
            DayTask.title == "mon only",
        ).all()
        assert len(day_tasks) == 1
        assert day_tasks[0].source_week_task_id is not None

    def test_apply_clamps_negative_end_offset(self, client, auth_headers):
        """If end_offset < start_offset, the route clamps end to start so
        the WeekTask range is always valid."""
        body = {
            "name": "tpl",
            "color": "#abc",
            "tasks": [
                {"name": "weird", "start_offset": 3, "end_offset": 1},
            ],
        }
        tpl = client.post("/week-templates", headers=auth_headers, json=body).json()

        r = client.post(
            f"/week-templates/{tpl['id']}/apply",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat()},
        )
        out = r.json()
        # start_offset=3 -> Thursday, end clamped to start.
        assert out[0]["start_date"] == "2025-06-05"
        assert out[0]["end_date"] == "2025-06-05"

    def test_apply_404_for_unknown_template(self, client, auth_headers):
        r = client.post(
            "/week-templates/99999/apply",
            headers=auth_headers,
            json={"week_start": MONDAY.isoformat()},
        )
        assert r.status_code == 404
