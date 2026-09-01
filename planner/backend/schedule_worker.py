"""Лёгкий worker автоматической синхронизации расписаний в 08:00 и 20:00."""

from __future__ import annotations

import time
from datetime import datetime, time as datetime_time, timedelta

from sqlalchemy import or_

from db import ScheduleSubscription, SessionLocal
from schedule_sync import SAMARA_TZ, ScheduleSyncError, store_sync_error, sync_subscription


SYNC_HOURS = (8, 20)


def _scheduled_slot(now: datetime) -> datetime:
    """Последний наступивший слот; позволяет догнать его после перезапуска."""
    local_now = now.replace(tzinfo=None)
    if local_now.hour >= SYNC_HOURS[1]:
        return datetime.combine(local_now.date(), datetime_time(SYNC_HOURS[1]))
    if local_now.hour >= SYNC_HOURS[0]:
        return datetime.combine(local_now.date(), datetime_time(SYNC_HOURS[0]))
    return datetime.combine(local_now.date() - timedelta(days=1), datetime_time(SYNC_HOURS[1]))


def _sync_all(slot_started_at: datetime) -> None:
    with SessionLocal() as db:
        subscription_ids = [
            row[0]
            for row in db.query(ScheduleSubscription.id)
            .filter(
                or_(
                    ScheduleSubscription.last_attempt_at.is_(None),
                    ScheduleSubscription.last_attempt_at < slot_started_at,
                )
            )
            .all()
        ]

    for subscription_id in subscription_ids:
        with SessionLocal() as db:
            subscription = (
                db.query(ScheduleSubscription)
                .filter(ScheduleSubscription.id == subscription_id)
                .first()
            )
            if subscription is None:
                continue
            try:
                result = sync_subscription(db, subscription)
                print(
                    f"schedule sync user={subscription.user_id} "
                    f"events={result['events']} protected={result['protected_days']} "
                    f"unchanged={result['unchanged']}",
                    flush=True,
                )
            except ScheduleSyncError as exc:
                store_sync_error(db, subscription_id, str(exc))
                print(f"schedule sync failed id={subscription_id}: {exc}", flush=True)
            except Exception as exc:  # noqa: BLE001
                store_sync_error(db, subscription_id, "Внутренняя ошибка синхронизации")
                print(f"schedule sync unexpected error id={subscription_id}: {exc}", flush=True)


def main() -> None:
    print("schedule worker started (08:00, 20:00 local time)", flush=True)
    completed_slots: set[datetime] = set()
    while True:
        now = datetime.now(SAMARA_TZ)
        slot = _scheduled_slot(now)
        if slot not in completed_slots:
            try:
                _sync_all(slot)
            except Exception as exc:  # noqa: BLE001
                print(f"schedule sync cycle failed: {exc}", flush=True)
            else:
                completed_slots.add(slot)
                completed_slots = {
                    item for item in completed_slots if item.date() >= now.date() - timedelta(days=1)
                }
        time.sleep(60)


if __name__ == "__main__":
    main()
