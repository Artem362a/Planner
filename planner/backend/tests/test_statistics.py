"""Tests for the /statistics endpoint."""
from __future__ import annotations

from datetime import date, timedelta


def _add_task(db, user_id, *, status=0, priority="medium", category=None, duration_min=0, day=None):
    from db import DayTask

    db.add(
        DayTask(
            user_id=user_id,
            day=day or date.today(),
            title="t",
            priority=priority,
            status=status,
            order_index=0,
            category=category,
            duration_min=duration_min,
        )
    )
    db.commit()


class TestStatistics:
    def test_empty_stats(self, client, auth_headers):
        r = client.get("/statistics", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["tasks"]["total"] == 0
        assert body["tasks"]["completed"] == 0
        assert body["tasks"]["completion_rate"] == 0
        assert body["streak"]["current"] == 0
        assert body["best_day"] is None
        # by_day is filled for every date in the period.
        assert len(body["tasks"]["by_day"]) == body["period"]["days"]

    def test_completion_rate_and_totals(self, client, db, user, auth_headers):
        _add_task(db, user.id, status=1)
        _add_task(db, user.id, status=1)
        _add_task(db, user.id, status=0)

        body = client.get("/statistics", headers=auth_headers).json()
        assert body["tasks"]["total"] == 3
        assert body["tasks"]["completed"] == 2
        assert body["tasks"]["completion_rate"] == 66.7

    def test_planned_minutes_summed(self, client, db, user, auth_headers):
        _add_task(db, user.id, duration_min=30)
        _add_task(db, user.id, duration_min=45)
        body = client.get("/statistics", headers=auth_headers).json()
        assert body["tasks"]["total_planned_min"] == 75

    def test_by_category_only_includes_known_categories(self, client, db, user, auth_headers):
        from db import TaskCategory

        db.add(TaskCategory(user_id=user.id, key="sport", title="Спорт", color="#FF0000", icon="run"))
        db.commit()

        _add_task(db, user.id, status=1, category="sport", duration_min=45)
        _add_task(db, user.id, status=0, category="sport", duration_min=30)
        _add_task(db, user.id, status=0, category="unknown_key", duration_min=60)

        body = client.get("/statistics", headers=auth_headers).json()
        cats = {c["key"]: c for c in body["tasks"]["by_category"]}
        assert "sport" in cats
        assert cats["sport"]["total"] == 2
        assert cats["sport"]["completed"] == 1
        assert cats["sport"]["planned_min"] == 75
        assert cats["sport"]["completed_min"] == 45
        assert "unknown_key" not in cats

    def test_streak_counts_today_back(self, client, db, user, auth_headers):
        _add_task(db, user.id, status=1, day=date.today())
        body = client.get("/statistics", headers=auth_headers).json()
        assert body["streak"]["current"] >= 1
        assert body["best_day"]["date"] == date.today().isoformat()

    def test_streak_not_limited_by_period(self, client, db, user, auth_headers):
        """Стрик глобальный: 10 дней подряд видны целиком даже при period=7."""
        from datetime import timedelta

        for offset in range(10):
            _add_task(db, user.id, status=1, day=date.today() - timedelta(days=offset))

        body = client.get("/statistics?period_days=7", headers=auth_headers).json()
        assert body["streak"]["current"] == 10
        assert body["streak"]["best"] == 10

    def test_streak_breaks_on_gap(self, client, db, user, auth_headers):
        from datetime import timedelta

        today = date.today()
        # 2 дня подряд до сегодня, разрыв, и ещё 3 дня раньше
        for offset in (0, 1, 3, 4, 5):
            _add_task(db, user.id, status=1, day=today - timedelta(days=offset))

        body = client.get("/statistics", headers=auth_headers).json()
        assert body["streak"]["current"] == 2
        assert body["streak"]["best"] == 3

    def test_isolation_between_users(self, client, db, user, other_user, auth_headers):
        _add_task(db, other_user.id, status=1)
        _add_task(db, other_user.id, status=1)

        body = client.get("/statistics", headers=auth_headers).json()
        assert body["tasks"]["total"] == 0

    def test_period_days_validation(self, client, auth_headers):
        assert client.get("/statistics?period_days=5", headers=auth_headers).status_code == 422
        assert client.get("/statistics?period_days=400", headers=auth_headers).status_code == 422

    def test_can_request_a_previous_period(self, client, db, user, auth_headers):
        selected_end = date.today() - timedelta(days=30)
        _add_task(db, user.id, status=1, day=selected_end)
        _add_task(db, user.id, status=1, day=selected_end + timedelta(days=1))

        body = client.get(
            f"/statistics?period_days=7&end_date={selected_end.isoformat()}",
            headers=auth_headers,
        ).json()

        assert body["period"]["end"] == selected_end.isoformat()
        assert body["period"]["start"] == (
            selected_end - timedelta(days=6)
        ).isoformat()
        assert body["tasks"]["total"] == 1

    def test_all_time_includes_tasks_older_than_a_year(
        self, client, db, user, auth_headers
    ):
        old_day = date.today() - timedelta(days=500)
        _add_task(db, user.id, status=1, day=old_day)

        regular = client.get("/statistics?period_days=365", headers=auth_headers).json()
        all_time = client.get("/statistics?all_time=true", headers=auth_headers).json()

        assert regular["tasks"]["total"] == 0
        assert all_time["tasks"]["total"] == 1
        assert all_time["period"]["start"] == old_day.isoformat()
        assert all_time["period"]["all_time"] is True

    def test_future_period_end_is_rejected(self, client, auth_headers):
        future = date.today() + timedelta(days=1)
        response = client.get(
            f"/statistics?end_date={future.isoformat()}", headers=auth_headers
        )
        assert response.status_code == 422

    def test_requires_auth(self, client):
        assert client.get("/statistics").status_code in (401, 403)
