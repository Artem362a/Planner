from __future__ import annotations

import hashlib
import ipaddress
import re
import socket
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import or_
from sqlalchemy.orm import Session

from db import (
    DayNote,
    DaySettings,
    DayTask,
    Notification,
    NotificationRecipient,
    ScheduleEvent,
    ScheduleSubscription,
    ScheduleSyncAlert,
    TaskCategory,
    TelegramLink,
)


MAX_ICS_BYTES = 2 * 1024 * 1024
MAX_ICS_EVENTS = 2000
ALLOWED_ICS_HOST = "stud.l9labs.ru"
ALLOWED_SUBGROUPS = {"1", "2", "all"}
LESSON_TYPES = {"lecture", "practice", "lab", "other"}


class ScheduleSyncError(ValueError):
    pass


def _samara_timezone():
    try:
        return ZoneInfo("Europe/Samara")
    except ZoneInfoNotFoundError:
        # Самара с 2016 года живёт в UTC+4 без сезонного перевода часов.
        return timezone(timedelta(hours=4), name="Europe/Samara")


SAMARA_TZ = _samara_timezone()


@dataclass(frozen=True)
class ParsedScheduleEvent:
    event_key: str
    event_hash: str
    uid: str | None
    day: date
    start_time: time
    end_time: time
    duration_min: int
    subject: str
    teacher: str | None
    location: str | None
    lesson_type: str
    subgroup: str | None
    conference_url: str | None


def validate_feed_url(raw_url: str) -> str:
    url = (raw_url or "").strip()
    if len(url) > 2048 or any(char in url for char in "\r\n\t"):
        raise ScheduleSyncError("Ссылка на расписание имеет недопустимый формат")
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower().rstrip(".")

    if parsed.scheme != "https":
        raise ScheduleSyncError("Ссылка на расписание должна начинаться с https://")
    if hostname != ALLOWED_ICS_HOST and not hostname.endswith(f".{ALLOWED_ICS_HOST}"):
        raise ScheduleSyncError("Разрешены только ссылки сервиса stud.l9labs.ru")
    if parsed.username or parsed.password:
        raise ScheduleSyncError("Ссылка с логином или паролем не поддерживается")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ScheduleSyncError("В ссылке указан недопустимый порт") from exc
    if port not in (None, 443):
        raise ScheduleSyncError("В ссылке указан недопустимый порт")
    return url


def mask_feed_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    path = parsed.path or "/"
    tail = path.rsplit("/", 1)[-1]
    masked_tail = f"{tail[:4]}••••{tail[-4:]}" if len(tail) > 10 else "••••••••"
    prefix = path[: -len(tail)] if tail else path
    return f"{parsed.scheme}://{parsed.netloc}{prefix}{masked_tail}"


def _assert_public_host(hostname: str) -> None:
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)}
    except OSError as exc:
        raise ScheduleSyncError("Не удалось определить адрес сервера расписания") from exc

    if not addresses:
        raise ScheduleSyncError("Сервер расписания не найден")

    for raw in addresses:
        address = ipaddress.ip_address(raw)
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        ):
            raise ScheduleSyncError("Ссылка ведёт на недопустимый сетевой адрес")


class _SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        safe_url = validate_feed_url(newurl)
        parsed = urlparse(safe_url)
        _assert_public_host(parsed.hostname or "")
        return super().redirect_request(req, fp, code, msg, headers, safe_url)


def fetch_ics(feed_url: str) -> str:
    safe_url = validate_feed_url(feed_url)
    parsed = urlparse(safe_url)
    _assert_public_host(parsed.hostname or "")

    request = Request(
        safe_url,
        headers={
            "Accept": "text/calendar,text/plain;q=0.9,*/*;q=0.2",
            "User-Agent": "DayPlan-ScheduleSync/1.0",
        },
    )
    opener = build_opener(_SafeRedirectHandler())

    try:
        with opener.open(request, timeout=20) as response:
            content_length = response.headers.get("Content-Length")
            if content_length:
                try:
                    declared_size = int(content_length)
                except ValueError:
                    declared_size = None
                if declared_size is not None and declared_size > MAX_ICS_BYTES:
                    raise ScheduleSyncError("Файл расписания больше 2 МБ")
            payload = response.read(MAX_ICS_BYTES + 1)
    except ScheduleSyncError:
        raise
    except HTTPError as exc:
        raise ScheduleSyncError(f"Сервис расписания вернул ошибку HTTP {exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise ScheduleSyncError("Не удалось загрузить расписание") from exc

    if len(payload) > MAX_ICS_BYTES:
        raise ScheduleSyncError("Файл расписания больше 2 МБ")

    try:
        return payload.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ScheduleSyncError("Расписание должно быть в кодировке UTF-8") from exc


def _unfold_ics_lines(text: str) -> list[str]:
    raw_lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    result: list[str] = []
    for line in raw_lines:
        if line.startswith((" ", "\t")) and result:
            result[-1] += line[1:]
        else:
            result.append(line)
    return result


def _unescape_ics(value: str) -> str:
    return (
        value.replace("\\N", "\n")
        .replace("\\n", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
        .strip()
    )


def _parse_property(line: str) -> tuple[str, dict[str, str], str] | None:
    if ":" not in line:
        return None
    head, value = line.split(":", 1)
    parts = head.split(";")
    name = parts[0].upper()
    params: dict[str, str] = {}
    for raw in parts[1:]:
        if "=" in raw:
            key, param_value = raw.split("=", 1)
            params[key.upper()] = param_value.strip('"')
    return name, params, _unescape_ics(value)


def _parse_ics_datetime(value: str, params: dict[str, str], calendar_tz: str | None) -> datetime | None:
    if params.get("VALUE", "").upper() == "DATE" or re.fullmatch(r"\d{8}", value):
        return None

    clean = value.strip()
    formats = ("%Y%m%dT%H%M%S", "%Y%m%dT%H%M")
    is_utc = clean.endswith("Z")
    if is_utc:
        clean = clean[:-1]

    parsed: datetime | None = None
    for fmt in formats:
        try:
            parsed = datetime.strptime(clean, fmt)
            break
        except ValueError:
            continue
    if parsed is None:
        raise ScheduleSyncError(f"Не удалось разобрать дату события: {value}")

    if is_utc:
        aware = parsed.replace(tzinfo=timezone.utc)
    else:
        tz_name = params.get("TZID") or calendar_tz or "Europe/Samara"
        try:
            event_tz = ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            event_tz = SAMARA_TZ
        aware = parsed.replace(tzinfo=event_tz)
    return aware.astimezone(SAMARA_TZ)


def _lesson_type(location: str | None, summary: str) -> str:
    probe = f"{location or ''} {summary}".lower()
    if "лаб" in probe:
        return "lab"
    if "практ" in probe:
        return "practice"
    if "лек" in probe:
        return "lecture"
    return "other"


def _split_subject_and_subgroup(summary: str) -> tuple[str, str | None]:
    cleaned = re.sub(r"^[\s📚📗📘📕📙📓📒]+", "", summary).strip()
    match = re.search(r"\s*\(([12])\)\s*$", cleaned)
    subgroup = match.group(1) if match else None
    if match:
        cleaned = cleaned[: match.start()].rstrip()
    return cleaned or "Занятие", subgroup


def _location_value(location: str | None) -> str | None:
    if not location:
        return None
    value = location.split("/", 1)[1] if "/" in location else location
    value = value.strip()
    if not value:
        return None
    if value.lower() == "online":
        return "онлайн"
    return re.sub(r"\s*-\s*", "-", value)


def task_title_for_event(event: ParsedScheduleEvent) -> str:
    location = _location_value(event.location)
    return f"{event.subject} · {location}" if location else event.subject


def _conference_url(*values: str | None) -> str | None:
    for value in values:
        if not value:
            continue
        match = re.search(r"https://[^\s<>]+", value)
        if match:
            return match.group(0).rstrip(".,;)")
    return None


def parse_ics(text: str) -> list[ParsedScheduleEvent]:
    if "BEGIN:VCALENDAR" not in text.upper():
        raise ScheduleSyncError("Файл не является календарём ICS")

    calendar_tz: str | None = None
    events_raw: list[dict[str, list[tuple[dict[str, str], str]]]] = []
    current: dict[str, list[tuple[dict[str, str], str]]] | None = None

    for line in _unfold_ics_lines(text):
        upper = line.upper()
        if upper == "BEGIN:VEVENT":
            current = defaultdict(list)
            continue
        if upper == "END:VEVENT":
            if current is not None:
                events_raw.append(dict(current))
            current = None
            if len(events_raw) > MAX_ICS_EVENTS:
                raise ScheduleSyncError("В расписании слишком много событий")
            continue

        prop = _parse_property(line)
        if prop is None:
            continue
        name, params, value = prop
        if current is None:
            if name == "X-WR-TIMEZONE":
                calendar_tz = value
            continue
        current[name].append((params, value))

    if not events_raw:
        raise ScheduleSyncError("В календаре нет занятий")

    parsed_events: list[ParsedScheduleEvent] = []
    duplicate_counts: dict[str, int] = defaultdict(int)

    for props in events_raw:
        status = props.get("STATUS", [({}, "")])[0][1].upper()
        if status == "CANCELLED":
            continue

        if not props.get("DTSTART") or not props.get("DTEND"):
            continue
        start_params, start_raw = props["DTSTART"][0]
        end_params, end_raw = props["DTEND"][0]
        start = _parse_ics_datetime(start_raw, start_params, calendar_tz)
        end = _parse_ics_datetime(end_raw, end_params, calendar_tz)
        if start is None or end is None:
            # События на весь день не являются учебными парами.
            continue
        if end <= start:
            raise ScheduleSyncError("У занятия окончание указано раньше начала")

        summary = props.get("SUMMARY", [({}, "Занятие")])[0][1].strip()
        description = props.get("DESCRIPTION", [({}, "")])[0][1].strip() or None
        location = props.get("LOCATION", [({}, "")])[0][1].strip() or None
        uid = props.get("UID", [({}, "")])[0][1].strip() or None
        direct_url = props.get("URL", [({}, "")])[0][1].strip() or None
        subject, subgroup = _split_subject_and_subgroup(summary)
        lesson_type = _lesson_type(location, summary)
        duration_min = int((end - start).total_seconds() // 60)

        canonical = "|".join(
            [
                uid or "",
                start.isoformat(),
                end.isoformat(),
                subject,
                description or "",
                location or "",
                subgroup or "",
            ]
        )
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        base_key = f"uid:{uid}" if uid else f"hash:{digest}"
        duplicate_counts[base_key] += 1
        event_key = base_key
        if duplicate_counts[base_key] > 1:
            event_key = f"{base_key}:{duplicate_counts[base_key]}"

        parsed_events.append(
            ParsedScheduleEvent(
                event_key=event_key,
                event_hash=digest,
                uid=uid,
                day=start.date(),
                start_time=start.time().replace(tzinfo=None),
                end_time=end.time().replace(tzinfo=None),
                duration_min=duration_min,
                subject=subject,
                teacher=description,
                location=location,
                lesson_type=lesson_type,
                subgroup=subgroup,
                conference_url=_conference_url(direct_url, description, location),
            )
        )

    if not parsed_events:
        raise ScheduleSyncError("В календаре нет занятий с указанием времени")
    return sorted(parsed_events, key=lambda item: (item.day, item.start_time, item.subject, item.event_key))


def _event_from_row(row: Any) -> ParsedScheduleEvent:
    return ParsedScheduleEvent(
        event_key=row.event_key,
        event_hash=row.event_hash,
        uid=row.uid,
        day=row.day,
        start_time=row.start_time,
        end_time=row.end_time,
        duration_min=row.duration_min,
        subject=row.subject,
        teacher=row.teacher,
        location=row.location,
        lesson_type=row.lesson_type,
        subgroup=row.subgroup,
        conference_url=row.conference_url,
    )


def event_matches_subgroup(event: ParsedScheduleEvent, subgroup: str) -> bool:
    return subgroup == "all" or event.subgroup is None or event.subgroup == subgroup


def lock_day_plan(db: Session, user_id: int, target_day: date) -> None:
    settings = (
        db.query(DaySettings)
        .filter(DaySettings.user_id == user_id, DaySettings.day == target_day)
        .first()
    )
    if settings is None:
        db.add(DaySettings(user_id=user_id, day=target_day, plan_locked=True))
    else:
        settings.plan_locked = True


def is_day_plan_protected(
    db: Session,
    user_id: int,
    target_day: date,
    subscription_id: int,
    *,
    today: date,
) -> bool:
    if target_day <= today:
        return True

    locked = (
        db.query(DaySettings.id)
        .filter(
            DaySettings.user_id == user_id,
            DaySettings.day == target_day,
            DaySettings.plan_locked.is_(True),
        )
        .first()
    )
    if locked is not None:
        return True

    manual_task = (
        db.query(DayTask.id)
        .filter(
            DayTask.user_id == user_id,
            DayTask.day == target_day,
            or_(
                DayTask.schedule_subscription_id.is_(None),
                DayTask.schedule_subscription_id != subscription_id,
            ),
        )
        .first()
    )
    if manual_task is not None:
        return True

    note = (
        db.query(DayNote.id)
        .filter(DayNote.user_id == user_id, DayNote.day == target_day, DayNote.text != "")
        .first()
    )
    return note is not None


def _event_signature(event: ParsedScheduleEvent) -> tuple[Any, ...]:
    return (
        event.start_time,
        event.end_time,
        event.subject,
        event.teacher,
        event.location,
        event.lesson_type,
        event.subgroup,
        event.conference_url,
    )


def _events_by_day(events: list[ParsedScheduleEvent]) -> dict[date, list[ParsedScheduleEvent]]:
    result: dict[date, list[ParsedScheduleEvent]] = defaultdict(list)
    for event in events:
        result[event.day].append(event)
    return result


def _changed_dates(
    old_events: list[ParsedScheduleEvent],
    new_events: list[ParsedScheduleEvent],
) -> set[date]:
    old_by_day = _events_by_day(old_events)
    new_by_day = _events_by_day(new_events)
    changed: set[date] = set()
    for target_day in set(old_by_day) | set(new_by_day):
        old_signatures = sorted((_event_signature(item) for item in old_by_day[target_day]), key=str)
        new_signatures = sorted((_event_signature(item) for item in new_by_day[target_day]), key=str)
        if old_signatures != new_signatures:
            changed.add(target_day)
    return changed


def _protected_change_message(
    changed_dates: list[date],
    old_events: list[ParsedScheduleEvent],
    new_events: list[ParsedScheduleEvent],
) -> str:
    old_by_day = _events_by_day(old_events)
    new_by_day = _events_by_day(new_events)
    lines = ["Расписание изменилось, но составленные планы дней оставлены без изменений."]
    for target_day in changed_dates[:6]:
        old_items = old_by_day.get(target_day, [])
        new_items = new_by_day.get(target_day, [])
        old_labels = {f"{item.start_time:%H:%M} {item.subject}" for item in old_items}
        new_labels = {f"{item.start_time:%H:%M} {item.subject}" for item in new_items}
        added = sorted(new_labels - old_labels)
        removed = sorted(old_labels - new_labels)
        details: list[str] = []
        if added:
            details.append("добавлено: " + ", ".join(added[:3]))
        if removed:
            details.append("убрано/перенесено: " + ", ".join(removed[:3]))
        if not details:
            details.append("изменились преподаватель, место или параметры пары")
        lines.append(f"{target_day:%d.%m}: " + "; ".join(details))
    if len(changed_dates) > 6:
        lines.append(f"И ещё изменённых дней: {len(changed_dates) - 6}.")
    return "\n".join(lines)


def _create_change_notification(db: Session, user_id: int, message: str) -> None:
    notification = Notification(
        title="Расписание изменилось",
        message=message,
        created_by_user_id=user_id,
        audience_type="single",
    )
    db.add(notification)
    db.flush()
    db.add(
        NotificationRecipient(
            notification_id=notification.id,
            user_id=user_id,
            is_read=False,
        )
    )

    telegram_linked = (
        db.query(TelegramLink.id)
        .filter(TelegramLink.user_id == user_id, TelegramLink.chat_id.isnot(None))
        .first()
    )
    if telegram_linked is not None:
        db.add(ScheduleSyncAlert(user_id=user_id, message=message))


def _identity(event: ParsedScheduleEvent) -> tuple[Any, ...]:
    return (event.day, event.subject, event.lesson_type, event.subgroup, event.teacher)


def _diff_counts(
    old_events: list[ParsedScheduleEvent],
    new_events: list[ParsedScheduleEvent],
) -> tuple[int, int, int]:
    old_by_identity = {_identity(item): item for item in old_events}
    new_by_identity = {_identity(item): item for item in new_events}
    added = len(set(new_by_identity) - set(old_by_identity))
    removed = len(set(old_by_identity) - set(new_by_identity))
    updated = sum(
        1
        for key in set(old_by_identity) & set(new_by_identity)
        if _event_signature(old_by_identity[key]) != _event_signature(new_by_identity[key])
    )
    return added, updated, removed


def sync_subscription(
    db: Session,
    subscription: ScheduleSubscription,
    *,
    ics_text: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    locked_subscription = (
        db.query(ScheduleSubscription)
        .filter(ScheduleSubscription.id == subscription.id)
        .populate_existing()
        .with_for_update()
        .one_or_none()
    )
    if locked_subscription is None:
        raise ScheduleSyncError("Подписка на расписание больше не существует")
    subscription = locked_subscription

    now = now or datetime.now(SAMARA_TZ).replace(tzinfo=None)
    today = now.date()
    subscription.last_attempt_at = now

    text = ics_text if ics_text is not None else fetch_ics(subscription.feed_url)
    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    old_rows = (
        db.query(ScheduleEvent)
        .filter(ScheduleEvent.subscription_id == subscription.id)
        .order_by(ScheduleEvent.day, ScheduleEvent.start_time, ScheduleEvent.id)
        .all()
    )
    old_events_all = [_event_from_row(row) for row in old_rows]

    if subscription.last_content_hash == content_hash and old_events_all:
        subscription.last_synced_at = now
        subscription.last_error = None
        db.commit()
        return {
            "unchanged": True,
            "added": 0,
            "updated": 0,
            "removed": 0,
            "protected_days": 0,
            "events": len(
                [
                    item
                    for item in old_events_all
                    if event_matches_subgroup(item, subscription.subgroup)
                ]
            ),
        }

    force_reconcile = subscription.last_content_hash is None and bool(old_events_all)
    new_events_all = parse_ics(text)
    subgroup = subscription.subgroup if subscription.subgroup in ALLOWED_SUBGROUPS else "all"
    old_selected = [item for item in old_events_all if event_matches_subgroup(item, subgroup)]
    new_selected = [item for item in new_events_all if event_matches_subgroup(item, subgroup)]
    added, updated, removed = _diff_counts(old_selected, new_selected)

    old_by_day = _events_by_day(old_selected)
    new_by_day = _events_by_day(new_selected)
    changed = _changed_dates(old_selected, new_selected)
    dates_to_reconcile = set(changed)
    if force_reconcile:
        imported_task_days = {
            row[0]
            for row in db.query(DayTask.day)
            .filter(
                DayTask.user_id == subscription.user_id,
                DayTask.schedule_subscription_id == subscription.id,
            )
            .distinct()
            .all()
        }
        dates_to_reconcile.update(imported_task_days)
        dates_to_reconcile.update(old_by_day)
        dates_to_reconcile.update(new_by_day)

    protected_dates: list[date] = []
    has_university = (
        db.query(TaskCategory.id)
        .filter(TaskCategory.user_id == subscription.user_id, TaskCategory.key == "university")
        .first()
        is not None
    )

    for target_day in sorted(dates_to_reconcile):
        if target_day <= today:
            continue
        if is_day_plan_protected(
            db,
            subscription.user_id,
            target_day,
            subscription.id,
            today=today,
        ):
            protected_dates.append(target_day)
            continue

        db.query(DayTask).filter(
            DayTask.user_id == subscription.user_id,
            DayTask.day == target_day,
            DayTask.schedule_subscription_id == subscription.id,
        ).delete(synchronize_session=False)

        max_order = (
            db.query(DayTask.order_index)
            .filter(DayTask.user_id == subscription.user_id, DayTask.day == target_day)
            .order_by(DayTask.order_index.desc())
            .first()
        )
        order_index = (max_order[0] + 1) if max_order else 0
        for event in sorted(new_by_day.get(target_day, []), key=lambda item: item.start_time):
            db.add(
                DayTask(
                    user_id=subscription.user_id,
                    day=target_day,
                    title=task_title_for_event(event),
                    start_time=event.start_time,
                    duration_min=event.duration_min,
                    priority="medium",
                    category="university" if has_university else None,
                    status=0,
                    subtasks=[],
                    order_index=order_index,
                    schedule_subscription_id=subscription.id,
                    schedule_event_key=event.event_key,
                    schedule_lesson_type=event.lesson_type,
                )
            )
            order_index += 1

    notify_dates = sorted(
        target_day
        for target_day in changed
        if target_day >= today
        and (
            target_day <= today
            or target_day in protected_dates
            or is_day_plan_protected(
                db,
                subscription.user_id,
                target_day,
                subscription.id,
                today=today,
            )
        )
    )
    if old_events_all and notify_dates:
        _create_change_notification(
            db,
            subscription.user_id,
            _protected_change_message(notify_dates, old_selected, new_selected),
        )

    db.query(ScheduleEvent).filter(ScheduleEvent.subscription_id == subscription.id).delete(
        synchronize_session=False
    )
    for event in new_events_all:
        db.add(
            ScheduleEvent(
                subscription_id=subscription.id,
                event_key=event.event_key,
                event_hash=event.event_hash,
                uid=event.uid,
                day=event.day,
                start_time=event.start_time,
                end_time=event.end_time,
                duration_min=event.duration_min,
                subject=event.subject,
                teacher=event.teacher,
                location=event.location,
                lesson_type=event.lesson_type,
                subgroup=event.subgroup,
                conference_url=event.conference_url,
            )
        )

    subscription.last_content_hash = content_hash
    subscription.last_synced_at = now
    subscription.last_error = None
    subscription.updated_at = now
    db.commit()

    return {
        "unchanged": False,
        "added": added,
        "updated": updated,
        "removed": removed,
        "protected_days": len(protected_dates),
        "events": len(new_selected),
    }


def store_sync_error(db: Session, subscription_id: int, message: str) -> None:
    db.rollback()
    subscription = db.query(ScheduleSubscription).filter(ScheduleSubscription.id == subscription_id).first()
    if subscription is None:
        return
    subscription.last_attempt_at = datetime.now(SAMARA_TZ).replace(tzinfo=None)
    subscription.last_error = message[:1000]
    db.commit()
