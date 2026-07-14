"""Правила повторяющихся напоминаний.

Общая логика для backend (routers/notifications.py) и бота (bot/bot.py):
оба перепланируют повторяющееся напоминание на следующее срабатывание.
"""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta
from typing import Any

RECUR_UNITS = ("day", "week", "month")

# Ограничения настроек напоминаний (users.*) и recur_every.
REMINDER_SETTINGS_LIMITS = {
    "task_reminder_lead_min": (0, 24 * 60),
    "reminder_repeat_min": (0, 24 * 60),
    "reminder_repeat_max": (0, 10),
    "goal_deadline_days": (0, 60),
}
RECUR_EVERY_MAX = 365


def add_interval(dt: datetime, every: int, unit: str) -> datetime:
    """dt + every единиц unit. Для месяцев день зажимается концом месяца
    (31 янв + 1 мес = 28/29 фев)."""
    if unit == "day":
        return dt + timedelta(days=every)
    if unit == "week":
        return dt + timedelta(weeks=every)
    if unit == "month":
        month_index = dt.month - 1 + every
        year = dt.year + month_index // 12
        month = month_index % 12 + 1
        day = min(dt.day, calendar.monthrange(year, month)[1])
        return dt.replace(year=year, month=month, day=day)
    raise ValueError(f"unknown recur_unit: {unit}")


def next_occurrence(remind_at: datetime, every: int, unit: str, now: datetime) -> datetime:
    """Ближайшее срабатывание строго в будущем, с шагом от remind_at.

    Шаг от планового времени (не от момента ответа) — чтобы «каждый день в 9:00»
    не уползало, даже если пользователь ответил в 9:40.
    """
    nxt = add_interval(remind_at, every, unit)
    while nxt <= now:
        nxt = add_interval(nxt, every, unit)
    return nxt


def reschedule_recurring(reminder: Any, now: datetime) -> None:
    """Перевести повторяющееся напоминание в pending на следующее срабатывание."""
    reminder.remind_at = next_occurrence(
        reminder.remind_at, reminder.recur_every, reminder.recur_unit, now
    )
    reminder.sent = False
    reminder.sent_at = None
    reminder.ack = None
    reminder.ack_at = None
    reminder.repeat_count = 0
