"""Every completion entry point must apply the same day/week/inbox rules."""
import importlib.util
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from db import DaySettings, DayTask, InboxTask, Reminder, WeekTask


@pytest.fixture
def planner_bot(_txn, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123456:unit-test-token")
    monkeypatch.setenv("TELEGRAM_PROXY", "")
    monkeypatch.setenv("PYTHON_DOTENV_DISABLED", "1")
    path = Path(__file__).resolve().parents[2] / "bot" / "bot.py"
    spec = importlib.util.spec_from_file_location("planner_bot_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "SessionLocal", lambda: Session(bind=_txn, join_transaction_mode="create_savepoint", autoflush=False))
    try:
        yield module
    finally:
        module.bot.stop_bot()


@pytest.mark.parametrize("entry_point", ["api_ack", "bot_ack", "bot_toggle"])
@pytest.mark.parametrize("task_type", ["normal", "recurring"])
def test_completion_syncs_week_and_inbox(
    client, db, user, auth_headers, request, entry_point, task_type
):
    start = date.today() + timedelta(days=7)
    inbox = InboxTask(user_id=user.id, title="source")
    week = WeekTask(user_id=user.id, name="week", start_date=start, end_date=start + timedelta(days=2), task_type=task_type, status=0)
    db.add_all([inbox, week])
    db.flush()
    tasks = [DayTask(user_id=user.id, day=start + timedelta(days=i), title="day", status=0,
                     source_week_task_id=week.id, source_inbox_task_id=inbox.id) for i in range(3)]
    db.add_all(tasks)
    db.flush()
    target = tasks[1]
    reminder = Reminder(user_id=user.id, text="fired", kind="task", source_task_id=target.id,
                        remind_at=datetime.now() - timedelta(minutes=5), sent=True, sent_at=datetime.now())
    db.add(reminder)
    db.commit()
    task_ids = [t.id for t in tasks]
    reminder_id = reminder.id
    week_id, inbox_id, uid = week.id, inbox.id, user.id

    if entry_point == "api_ack":
        response = client.post(f"/reminders/{reminder_id}/ack", headers=auth_headers, json={"status": "done"})
        assert response.status_code == 200
        assert response.json()["ack"] == "done"
    else:
        bot = request.getfixturevalue("planner_bot")
        if entry_point == "bot_ack":
            assert bot._ack_reminder(uid, reminder_id, "done") == ("ok", None)
        else:
            assert bot._toggle_day_task(uid, task_ids[1]) is True

    db.expire_all()
    assert db.get(DayTask, task_ids[1]).status == 1
    assert db.get(InboxTask, inbox_id).completed_at is not None
    assert db.query(DaySettings).filter(DaySettings.user_id == uid, DaySettings.day == start + timedelta(days=1)).one().plan_locked
    if task_type == "normal":
        assert db.get(WeekTask, week_id).status == 1
        assert db.get(DayTask, task_ids[0]).status == 1
        assert db.get(DayTask, task_ids[2]) is None
    else:
        assert db.get(WeekTask, week_id).status == 0
        assert db.get(DayTask, task_ids[0]).status == 0
        assert db.get(DayTask, task_ids[2]).status == 0
    if entry_point == "bot_toggle":
        assert db.get(Reminder, reminder_id) is None
        assert bot._toggle_day_task(uid, task_ids[1]) is True
        db.expire_all()
        assert db.get(WeekTask, week_id).status == 0
        assert db.query(DayTask).filter(DayTask.source_week_task_id == week_id, DayTask.day > start + timedelta(days=1)).count() == 1
    else:
        assert db.get(Reminder, reminder_id).ack == "done"
