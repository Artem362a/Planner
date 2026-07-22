"""Tests for /goals/* endpoints."""
from __future__ import annotations

from datetime import date, timedelta


class TestCreateGoal:
    def test_create_one_time_goal(self, client, auth_headers):
        target = (date.today() + timedelta(days=30)).isoformat()
        r = client.post(
            "/goals",
            headers=auth_headers,
            json={
                "title": "Run a marathon",
                "goal_type": "one_time",
                "target_date": target,
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "Run a marathon"
        assert body["goal_type"] == "one_time"
        assert body["target_date"] == target

    def test_one_time_goal_requires_target_date(self, client, auth_headers):
        r = client.post(
            "/goals",
            headers=auth_headers,
            json={"title": "x", "goal_type": "one_time"},
        )
        assert r.status_code == 400

    def test_recurring_goal_requires_repeat_unit(self, client, auth_headers):
        target = (date.today() + timedelta(days=30)).isoformat()
        r = client.post(
            "/goals",
            headers=auth_headers,
            json={
                "title": "Daily run",
                "goal_type": "recurring",
                "target_date": target,
            },
        )
        assert r.status_code == 400

    def test_recurring_goal_requires_target_date(self, client, auth_headers):
        r = client.post(
            "/goals",
            headers=auth_headers,
            json={"title": "x", "goal_type": "recurring", "repeat_unit": "day"},
        )
        assert r.status_code == 400

    def test_empty_title_rejected(self, client, auth_headers):
        r = client.post(
            "/goals",
            headers=auth_headers,
            json={
                "title": "   ",
                "goal_type": "one_time",
                "target_date": date.today().isoformat(),
            },
        )
        assert r.status_code == 400


class TestListGoals:
    def test_empty_list(self, client, auth_headers):
        r = client.get("/goals", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_list_only_my_goals(self, client, db, user, other_user, auth_headers):
        from db import Goal

        db.add(Goal(user_id=user.id, title="mine", color="#fff"))
        db.add(Goal(user_id=other_user.id, title="theirs", color="#fff"))
        db.commit()

        titles = [g["title"] for g in client.get("/goals", headers=auth_headers).json()]
        assert titles == ["mine"]

    def test_list_ordered_by_order_index(self, client, db, user, auth_headers):
        from db import Goal

        db.add(Goal(user_id=user.id, title="b", color="#fff", order_index=1))
        db.add(Goal(user_id=user.id, title="a", color="#fff", order_index=0))
        db.commit()

        titles = [g["title"] for g in client.get("/goals", headers=auth_headers).json()]
        assert titles == ["a", "b"]


class TestUpdateGoal:
    def test_update_title(self, client, auth_headers):
        target = (date.today() + timedelta(days=10)).isoformat()
        created = client.post(
            "/goals",
            headers=auth_headers,
            json={"title": "old", "goal_type": "one_time", "target_date": target},
        ).json()

        r = client.patch(
            f"/goals/{created['id']}",
            headers=auth_headers,
            json={"title": "new", "goal_type": "one_time", "target_date": target},
        )
        assert r.status_code == 200
        assert r.json()["title"] == "new"


class TestDeleteGoal:
    def test_delete(self, client, db, user, auth_headers):
        from db import Goal

        g = Goal(user_id=user.id, title="t", color="#fff")
        db.add(g)
        db.commit()
        db.refresh(g)

        r = client.delete(f"/goals/{g.id}", headers=auth_headers)
        assert r.status_code == 200
        assert db.query(Goal).filter(Goal.user_id == user.id).count() == 0

    def test_delete_other_users_goal_returns_404(self, client, db, other_user, auth_headers):
        from db import Goal

        g = Goal(user_id=other_user.id, title="theirs", color="#fff")
        db.add(g)
        db.commit()
        db.refresh(g)

        r = client.delete(f"/goals/{g.id}", headers=auth_headers)
        assert r.status_code == 404


class TestReorderGoals:
    def test_reorder(self, client, db, user, auth_headers):
        from db import Goal

        a = Goal(user_id=user.id, title="a", color="#fff", order_index=0)
        b = Goal(user_id=user.id, title="b", color="#fff", order_index=1)
        c = Goal(user_id=user.id, title="c", color="#fff", order_index=2)
        db.add_all([a, b, c])
        db.commit()
        db.refresh(a)
        db.refresh(b)
        db.refresh(c)

        r = client.post(
            "/goals/reorder",
            headers=auth_headers,
            json={"ordered_ids": [c.id, a.id, b.id]},
        )
        assert r.status_code == 200

        titles = [g["title"] for g in client.get("/goals", headers=auth_headers).json()]
        assert titles == ["c", "a", "b"]


class TestGoalsForDay:
    def test_recurring_day_goal_appears_every_day(self, client, db, user, auth_headers):
        from db import Goal

        target = date.today() + timedelta(days=365)
        db.add(Goal(
            user_id=user.id,
            title="daily run",
            color="#fff",
            goal_type="recurring",
            repeat_unit="day",
            target_date=target,
        ))
        db.commit()

        r = client.get(f"/goals/day/{date.today().isoformat()}", headers=auth_headers)
        assert len(r.json()) == 1

    def test_recurring_week_goal_only_on_mondays(self, client, db, user, auth_headers):
        from db import Goal

        target = date.today() + timedelta(days=365)
        db.add(Goal(
            user_id=user.id,
            title="weekly",
            color="#fff",
            goal_type="recurring",
            repeat_unit="week",
            target_date=target,
        ))
        db.commit()

        # Find next Monday and next Tuesday.
        today = date.today()
        monday = today + timedelta(days=(7 - today.weekday()) % 7)
        if monday.weekday() != 0:
            monday = today  # In case today is Monday.
        while monday.weekday() != 0:
            monday += timedelta(days=1)
        tuesday = monday + timedelta(days=1)

        r_mon = client.get(f"/goals/day/{monday.isoformat()}", headers=auth_headers)
        r_tue = client.get(f"/goals/day/{tuesday.isoformat()}", headers=auth_headers)

        assert len(r_mon.json()) == 1
        assert len(r_tue.json()) == 0

    def test_one_time_goal_appears_only_on_target_day(self, client, db, user, auth_headers):
        from db import Goal

        target = date.today() + timedelta(days=5)
        db.add(Goal(
            user_id=user.id,
            title="exam",
            color="#fff",
            goal_type="one_time",
            target_date=target,
        ))
        db.commit()

        on_target = client.get(f"/goals/day/{target.isoformat()}", headers=auth_headers).json()
        before = client.get(f"/goals/day/{(target - timedelta(days=1)).isoformat()}", headers=auth_headers).json()

        assert len(on_target) == 1
        assert before == []

    def test_done_goal_not_shown(self, client, db, user, auth_headers):
        from db import Goal

        target = date.today()
        db.add(Goal(
            user_id=user.id,
            title="done already",
            color="#fff",
            goal_type="one_time",
            target_date=target,
            status="done",
        ))
        db.commit()

        r = client.get(f"/goals/day/{target.isoformat()}", headers=auth_headers)
        assert r.json() == []


class TestGoalStages:
    def test_create_stage(self, client, auth_headers):
        target = (date.today() + timedelta(days=10)).isoformat()
        goal = client.post(
            "/goals",
            headers=auth_headers,
            json={"title": "g", "goal_type": "one_time", "target_date": target, "has_stages": True},
        ).json()

        r = client.post(
            f"/goals/{goal['id']}/stages",
            headers=auth_headers,
            json={"title": "stage 1"},
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["stages"]) == 1
        assert body["stages"][0]["title"] == "stage 1"

    def test_delete_stage(self, client, db, user, auth_headers):
        from db import Goal, GoalStage

        g = Goal(user_id=user.id, title="g", color="#fff", has_stages=True)
        db.add(g)
        db.commit()
        db.refresh(g)

        s = GoalStage(goal_id=g.id, title="s", order_index=0)
        db.add(s)
        db.commit()
        db.refresh(s)

        r = client.delete(f"/goals/{g.id}/stages/{s.id}", headers=auth_headers)
        assert r.status_code == 200
        assert db.query(GoalStage).filter(GoalStage.goal_id == g.id).count() == 0

    def test_create_stage_with_explicit_order_index(self, client, db, user, auth_headers):
        from db import Goal, GoalStage

        g = Goal(user_id=user.id, title="g", color="#fff", has_stages=True)
        db.add(g)
        db.commit()
        db.refresh(g)

        r = client.post(
            f"/goals/{g.id}/stages",
            headers=auth_headers,
            json={"title": "s", "order_index": 5},
        )
        assert r.status_code == 200
        stage = db.query(GoalStage).filter(GoalStage.goal_id == g.id).one()
        assert stage.order_index == 5

    def test_update_stage_order_index_reorders(self, client, db, user, auth_headers):
        from db import Goal, GoalStage

        g = Goal(user_id=user.id, title="g", color="#fff", has_stages=True)
        db.add(g)
        db.commit()
        db.refresh(g)

        a = GoalStage(goal_id=g.id, title="a", order_index=0)
        b = GoalStage(goal_id=g.id, title="b", order_index=1)
        db.add_all([a, b])
        db.commit()
        db.refresh(a)
        db.refresh(b)

        # Ставим "a" строго после "b" (order_index=2 > 1), как это делает
        # фронт после перетаскивания. Значение больше, а не равное, чтобы не
        # было ничьей по order_index (её порядок в SQLite/Postgres разный).
        r = client.patch(
            f"/goals/{g.id}/stages/{a.id}",
            headers=auth_headers,
            json={"title": "a", "order_index": 2},
        )
        assert r.status_code == 200
        # GoalOut отдаёт этапы в порядке order_index — "b" теперь первым.
        titles = [s["title"] for s in r.json()["stages"]]
        assert titles == ["b", "a"]

    def test_update_stage_without_order_index_keeps_position(self, client, db, user, auth_headers):
        from db import Goal, GoalStage

        g = Goal(user_id=user.id, title="g", color="#fff", has_stages=True)
        db.add(g)
        db.commit()
        db.refresh(g)

        s = GoalStage(goal_id=g.id, title="s", order_index=3)
        db.add(s)
        db.commit()
        db.refresh(s)

        r = client.patch(
            f"/goals/{g.id}/stages/{s.id}",
            headers=auth_headers,
            json={"title": "renamed"},
        )
        assert r.status_code == 200
        db.refresh(s)
        assert s.order_index == 3


class TestToggleGoalDayItem:
    def test_toggle_one_time_marks_done(self, client, db, user, auth_headers):
        from db import Goal

        target = date.today()
        g = Goal(
            user_id=user.id,
            title="g",
            color="#fff",
            goal_type="one_time",
            target_date=target,
            status="active",
        )
        db.add(g)
        db.commit()
        db.refresh(g)

        r = client.patch(
            "/goals/day-item/toggle",
            headers=auth_headers,
            json={"goal_id": g.id, "day": target.isoformat()},
        )
        assert r.status_code == 200

        db.refresh(g)
        assert g.status == "done"

    def test_toggle_recurring_creates_checkin(self, client, db, user, auth_headers):
        from db import Goal, GoalCheckin

        target = date.today() + timedelta(days=30)
        g = Goal(
            user_id=user.id,
            title="g",
            color="#fff",
            goal_type="recurring",
            repeat_unit="day",
            target_date=target,
        )
        db.add(g)
        db.commit()
        db.refresh(g)

        today = date.today()
        r = client.patch(
            "/goals/day-item/toggle",
            headers=auth_headers,
            json={"goal_id": g.id, "day": today.isoformat()},
        )
        assert r.status_code == 200

        checkin = (
            db.query(GoalCheckin)
            .filter(GoalCheckin.goal_id == g.id, GoalCheckin.check_date == today)
            .first()
        )
        assert checkin is not None
        assert checkin.done is True
