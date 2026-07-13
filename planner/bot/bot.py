"""Telegram-бот планировщика.

Тонкий слой поверх той же БД, что и бэкенд: шарит SQLAlchemy-модели,
работает через long polling (за NAT, без вебхуков).

MVP:
  - /start <код>  — привязка Telegram-чата к аккаунту (код берётся в вебе).
  - любое сообщение — быстрый захват во «Входящие».
  - /today        — задачи на сегодня.
  - /help         — помощь.
  - ежедневный дайджест (план на день + просрочка) в DIGEST_HOUR.
"""

from __future__ import annotations

import html
import os
import sys
import threading
import time as _time
from datetime import date, datetime, timedelta
from pathlib import Path

import telebot
from telebot import apihelper, types
from dotenv import load_dotenv

# Бот шарит модели и БД с бэкендом.
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# .env бэкенда содержит DATABASE_URL (+ туда же кладём TELEGRAM_BOT_TOKEN).
load_dotenv(BACKEND_DIR / ".env")
load_dotenv()  # на случай локального .env рядом с ботом

from db import (  # noqa: E402
    DayTask,
    InboxTask,
    Notification,
    NotificationRecipient,
    Reminder,
    SessionLocal,
    TelegramLink,
    WeekTask,
)

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
DIGEST_HOUR = int(os.getenv("TELEGRAM_DIGEST_HOUR", "8"))

# Прокси для доступа к api.telegram.org (если провайдер блокирует Telegram).
# Пример: TELEGRAM_PROXY=socks5h://127.0.0.1:10808  или  http://127.0.0.1:8080
TELEGRAM_PROXY = os.getenv("TELEGRAM_PROXY", "").strip()
if TELEGRAM_PROXY:
    apihelper.proxy = {"https": TELEGRAM_PROXY, "http": TELEGRAM_PROXY}

bot = telebot.TeleBot(TOKEN, parse_mode="HTML")


# ---------------------------------------------------------------- helpers


def _user_id_for_chat(chat_id: int) -> int | None:
    with SessionLocal() as db:
        link = (
            db.query(TelegramLink)
            .filter(TelegramLink.chat_id == str(chat_id))
            .first()
        )
        return link.user_id if link else None


def _try_link(chat_id: int, code: str) -> bool:
    """Привязать чат к аккаунту по одноразовому коду."""
    code = (code or "").strip()
    if not code:
        return False

    with SessionLocal() as db:
        link = (
            db.query(TelegramLink)
            .filter(TelegramLink.link_code == code)
            .first()
        )
        if link is None:
            return False
        if link.link_code_expires and link.link_code_expires < datetime.utcnow():
            return False

        # Освобождаем chat_id, если он был привязан к другому аккаунту.
        existing = (
            db.query(TelegramLink)
            .filter(
                TelegramLink.chat_id == str(chat_id),
                TelegramLink.id != link.id,
            )
            .first()
        )
        if existing:
            existing.chat_id = None

        link.chat_id = str(chat_id)
        link.link_code = None
        link.link_code_expires = None
        link.linked_at = datetime.utcnow()
        db.commit()
        return True


def _add_day_task(user_id: int, title: str, day: date) -> None:
    """Создаёт задачу дня без фиксированного времени (потоковую) — встаёт
    в конец дня, поэтому конфликтов по времени не возникает."""
    with SessionLocal() as db:
        max_order = (
            db.query(DayTask.order_index)
            .filter(DayTask.user_id == user_id, DayTask.day == day)
            .order_by(DayTask.order_index.desc())
            .first()
        )
        next_order = (max_order[0] + 1) if max_order else 0
        db.add(
            DayTask(
                user_id=user_id,
                day=day,
                title=title.strip()[:500],
                start_time=None,
                duration_min=None,
                priority="medium",
                category=None,
                status=0,
                subtasks=[],
                order_index=next_order,
            )
        )
        db.commit()


def _add_week_task(user_id: int, title: str, day: date) -> None:
    """Создаёт недельную задачу на один день (start=end=day) и, как в
    приложении, зеркалит её в план дня (DayTask с source_week_task_id)."""
    title = title.strip()[:500]
    with SessionLocal() as db:
        max_wo = (
            db.query(WeekTask.order_index)
            .filter(WeekTask.user_id == user_id)
            .order_by(WeekTask.order_index.desc())
            .first()
        )
        wt = WeekTask(
            user_id=user_id,
            name=title,
            start_date=day,
            end_date=day,
            category=None,
            important=False,
            status=0,
            task_type="normal",
            repeat_days=[],
            volume_value=None,
            subtasks=[],
            order_index=(max_wo[0] + 1) if max_wo else 0,
        )
        db.add(wt)
        db.flush()

        max_do = (
            db.query(DayTask.order_index)
            .filter(DayTask.user_id == user_id, DayTask.day == day)
            .order_by(DayTask.order_index.desc())
            .first()
        )
        db.add(
            DayTask(
                user_id=user_id,
                day=day,
                title=title,
                start_time=None,
                duration_min=None,
                priority="medium",
                category=None,
                status=0,
                subtasks=[],
                source_week_task_id=wt.id,
                order_index=(max_do[0] + 1) if max_do else 0,
            )
        )
        db.commit()


def _add_inbox(user_id: int, text: str) -> None:
    with SessionLocal() as db:
        db.add(
            InboxTask(
                user_id=user_id,
                title=text.strip()[:500],
                description=None,
                priority="medium",
                category=None,
                subtasks=[],
                created_at=datetime.utcnow(),
            )
        )
        db.commit()


def _add_reminder(user_id: int, text: str, remind_at: datetime) -> None:
    with SessionLocal() as db:
        db.add(
            Reminder(
                user_id=user_id,
                text=text.strip()[:1000],
                remind_at=remind_at.replace(second=0, microsecond=0),
            )
        )
        db.commit()


def _active_reminders(user_id: int) -> list:
    with SessionLocal() as db:
        return (
            db.query(Reminder)
            .filter(
                Reminder.user_id == user_id,
                Reminder.sent == False,  # noqa: E712
            )
            .order_by(Reminder.remind_at)
            .limit(25)
            .all()
        )


def _delete_reminder(user_id: int, reminder_id: int) -> bool:
    with SessionLocal() as db:
        r = (
            db.query(Reminder)
            .filter(Reminder.id == reminder_id, Reminder.user_id == user_id)
            .first()
        )
        if not r:
            return False
        db.delete(r)
        db.commit()
        return True


def _parse_hhmm(raw: str) -> tuple[int, int] | None:
    """«18:30», «18.30», «18 30», «1830», «9» → (час, минута) или None."""
    s = (raw or "").strip().replace(".", ":").replace(" ", ":")
    if not s:
        return None
    if s.isdigit():
        if len(s) <= 2:
            hh, mm = int(s), 0
        elif len(s) == 3:
            hh, mm = int(s[0]), int(s[1:])
        elif len(s) == 4:
            hh, mm = int(s[:2]), int(s[2:])
        else:
            return None
    elif ":" in s:
        parts = s.split(":")
        if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
            return None
        hh, mm = int(parts[0]), int(parts[1])
    else:
        return None
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        return None
    return hh, mm


def _today_tasks(user_id: int, day: date) -> list[DayTask]:
    with SessionLocal() as db:
        return (
            db.query(DayTask)
            .filter(DayTask.user_id == user_id, DayTask.day == day)
            .order_by(DayTask.order_index.asc())
            .all()
        )


def _overdue_count(user_id: int, day: date) -> int:
    """Та же логика, что в приложении (GET /day-tasks/overdue):
    прошедшие невыполненные неотклонённые задачи; задачи из недельной
    дедуплицируются и не считаются, пока недельная ещё активна."""
    with SessionLocal() as db:
        pending = (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user_id,
                DayTask.day < day,
                DayTask.status == 0,
                DayTask.dismissed.isnot(True),
            )
            .all()
        )

        count = 0
        seen_week_task_ids: set[int] = set()
        for t in pending:
            swid = getattr(t, "source_week_task_id", None)
            if swid is not None:
                if swid in seen_week_task_ids:
                    continue
                wt = (
                    db.query(WeekTask)
                    .filter(WeekTask.id == swid, WeekTask.user_id == user_id)
                    .first()
                )
                if wt is None:
                    continue
                if wt.end_date >= day:  # недельная ещё активна — не просрочка
                    continue
                seen_week_task_ids.add(swid)
            count += 1
        return count


def _toggle_day_task(user_id: int, task_id: int) -> bool:
    with SessionLocal() as db:
        task = (
            db.query(DayTask)
            .filter(DayTask.id == task_id, DayTask.user_id == user_id)
            .first()
        )
        if task is None:
            return False
        task.status = 0 if task.status == 1 else 1
        db.commit()
        return True


_RU_MONTHS = [
    "", "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]


def _format_plan(user_id: int, day: date) -> str:
    tasks = _today_tasks(user_id, day)
    header = f"🗓 <b>{day.day} {_RU_MONTHS[day.month]}</b>"

    if not tasks:
        return f"{header}\n\nНа сегодня задач нет 🙌"

    done = sum(1 for t in tasks if t.status == 1)
    lines = [f"{header}  ·  выполнено {done}/{len(tasks)}", ""]
    for t in tasks:
        mark = "✅" if t.status == 1 else "▫️"
        when = ""
        if t.start_time:
            when = f"  <i>{t.start_time.strftime('%H:%M')}</i>"
        title = html.escape(t.title)
        if t.status == 1:
            title = f"<s>{title}</s>"
        lines.append(f"{mark} {title}{when}")

    overdue = _overdue_count(user_id, day)
    if overdue:
        lines.append(f"\n⚠️ Просрочено задач: <b>{overdue}</b>")
    return "\n".join(lines)


def _today_keyboard(user_id: int, day: date) -> types.InlineKeyboardMarkup | None:
    """Кнопка-переключатель статуса на каждую задачу дня."""
    tasks = _today_tasks(user_id, day)
    if not tasks:
        return None
    kb = types.InlineKeyboardMarkup()
    for t in tasks:
        mark = "✅" if t.status == 1 else "▫️"
        label = f"{mark} {t.title}"
        if len(label) > 40:
            label = label[:39] + "…"
        kb.add(types.InlineKeyboardButton(label, callback_data=f"tgl:{t.id}"))
    return kb


def _capture_keyboard() -> types.InlineKeyboardMarkup:
    kb = types.InlineKeyboardMarkup()
    kb.add(
        types.InlineKeyboardButton("📥 Во входящие", callback_data="cap:in"),
        types.InlineKeyboardButton("🗓 В план дня", callback_data="cap:day"),
    )
    return kb


def _menu_keyboard() -> types.InlineKeyboardMarkup:
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton("🗓 План на сегодня", callback_data="menu:today"))
    kb.add(types.InlineKeyboardButton("➕ Задача в план дня", callback_data="menu:add"))
    kb.add(types.InlineKeyboardButton("📥 Во «Входящие»", callback_data="menu:inbox"))
    kb.add(types.InlineKeyboardButton("❓ Помощь", callback_data="menu:help"))
    return kb


# Постоянная нижняя панель (как «нативное» меню приложения).
BTN_TODAY = "🗓 Сегодня"
BTN_INBOX = "📥 Входящие"
BTN_DAY = "➕ В день"
BTN_WEEK = "📅 В неделю"
BTN_REMIND = "⏰ Напоминание"
BTN_HELP = "❓ Помощь"
MAIN_LABELS = {BTN_TODAY, BTN_INBOX, BTN_DAY, BTN_WEEK, BTN_REMIND, BTN_HELP}


def _main_reply_kb() -> types.ReplyKeyboardMarkup:
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row(BTN_TODAY, BTN_INBOX)
    kb.row(BTN_DAY, BTN_WEEK)
    kb.row(BTN_REMIND, BTN_HELP)
    return kb


# Незавершённые добавления: chat_id -> {"user_id", "dest" (day|week), "text"}.
# Шаг 1 — пользователь прислал текст; шаг 2 — выбирает день кнопкой.
_pending_add: dict[int, dict] = {}

_RU_WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]


def _day_picker_kb() -> types.InlineKeyboardMarkup:
    """Инлайн-выбор дня: ближайшие 7 дней."""
    kb = types.InlineKeyboardMarkup()
    today = date.today()
    row = []
    for offset in range(7):
        d = today + timedelta(days=offset)
        if offset == 0:
            label = "Сегодня"
        elif offset == 1:
            label = "Завтра"
        else:
            label = f"{_RU_WD[d.weekday()]} {d.day:02d}.{d.month:02d}"
        row.append(types.InlineKeyboardButton(label, callback_data=f"pick:{offset}"))
        if len(row) == 2:
            kb.row(*row)
            row = []
    if row:
        kb.row(*row)
    kb.row(types.InlineKeyboardButton("✖ Отмена", callback_data="pick:cancel"))
    return kb


# ---------------------------------------------------------------- handlers


@bot.message_handler(commands=["start"])
def handle_start(message):
    parts = (message.text or "").split(maxsplit=1)
    code = parts[1] if len(parts) > 1 else ""

    if code and _try_link(message.chat.id, code):
        bot.send_message(
            message.chat.id,
            "✅ <b>Аккаунт привязан!</b>\nПользуйся кнопками снизу 👇",
            reply_markup=_main_reply_kb(),
        )
        return

    if _user_id_for_chat(message.chat.id):
        bot.send_message(
            message.chat.id,
            "С возвращением 👋 Выбирай действие снизу.",
            reply_markup=_main_reply_kb(),
        )
        return

    bot.reply_to(
        message,
        "Привет! Чтобы привязать аккаунт:\n"
        "1. Открой приложение → Аккаунт → «Подключить Telegram».\n"
        "2. Нажми на ссылку или пришли мне код командой <code>/start КОД</code>.",
    )


HELP_TEXT = (
    "Пользуйся кнопками снизу 👇\n\n"
    "• <b>🗓 Сегодня</b> — план на сегодня (кнопки ✅ отмечают задачи)\n"
    "• <b>➕ В день</b> — задача в план дня (спрошу текст и день)\n"
    "• <b>📅 В неделю</b> — задача в план недели (текст и день)\n"
    "• <b>📥 Входящие</b> — закинуть во «Входящие»\n"
    "• <b>⏰ Напоминание</b> — текст, день и время; пришлю сюда и в колокольчик на сайте\n\n"
    "Ещё: просто напиши текст → спрошу, куда; /menu — показать кнопки; "
    "/start КОД — привязать аккаунт."
)


@bot.message_handler(commands=["help"])
def handle_help(message):
    bot.reply_to(message, HELP_TEXT)


@bot.message_handler(commands=["menu"])
def handle_menu(message):
    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(message, "Сначала привяжи аккаунт: /start КОД")
        return
    bot.send_message(
        message.chat.id, "📋 Меню — выбирай снизу 👇", reply_markup=_main_reply_kb()
    )


@bot.message_handler(func=lambda m: (m.text or "") in MAIN_LABELS)
def handle_main_buttons(message):
    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(message, "Сначала привяжи аккаунт: /start КОД")
        return

    label = message.text
    if label == BTN_TODAY:
        today = date.today()
        bot.send_message(
            message.chat.id,
            _format_plan(user_id, today),
            reply_markup=_today_keyboard(user_id, today),
        )
    elif label == BTN_HELP:
        bot.send_message(message.chat.id, HELP_TEXT)
    elif label == BTN_INBOX:
        msg = bot.send_message(
            message.chat.id,
            "Что добавить во «Входящие»? Пришли текст:",
            reply_markup=types.ForceReply(selective=False),
        )
        bot.register_next_step_handler(msg, _step_add_inbox, user_id)
    elif label == BTN_DAY:
        msg = bot.send_message(
            message.chat.id,
            "Что добавить в план дня? Пришли текст:",
            reply_markup=types.ForceReply(selective=False),
        )
        bot.register_next_step_handler(msg, _step_capture_name, user_id, "day")
    elif label == BTN_WEEK:
        msg = bot.send_message(
            message.chat.id,
            "Что добавить в план на неделю? Пришли текст:",
            reply_markup=types.ForceReply(selective=False),
        )
        bot.register_next_step_handler(msg, _step_capture_name, user_id, "week")
    elif label == BTN_REMIND:
        text, kb = _reminders_menu(user_id)
        bot.send_message(message.chat.id, text, reply_markup=kb)


def _step_capture_name(message, user_id, dest):
    """Шаг 1: получили текст задачи → спрашиваем день кнопками."""
    text = (message.text or "").strip()
    if not text or text.startswith("/"):
        bot.reply_to(message, "Отменено.")
        return
    _pending_add[message.chat.id] = {"user_id": user_id, "dest": dest, "text": text}
    if dest == "remind":
        question = f"На какой день поставить напоминание «{html.escape(text[:80])}»?"
    else:
        where = "в план на неделю" if dest == "week" else "в план дня"
        question = f"На какой день добавить {where} «{html.escape(text[:80])}»?"
    bot.send_message(
        message.chat.id,
        question,
        reply_markup=_day_picker_kb(),
    )


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("pick:"))
def cb_pick(call):
    chat_id = call.message.chat.id
    arg = call.data.split(":", 1)[1]
    pending = _pending_add.pop(chat_id, None)

    if arg == "cancel":
        bot.answer_callback_query(call.id, "Отменено")
        try:
            bot.edit_message_text("Отменено.", chat_id, call.message.message_id)
        except Exception:  # noqa: BLE001
            pass
        return

    if not pending:
        bot.answer_callback_query(call.id, "Сессия истекла, начни заново")
        return

    day = date.today() + timedelta(days=int(arg))
    text = pending["text"]
    label = f"{_RU_WD[day.weekday()]} {day.day:02d}.{day.month:02d}"

    if pending["dest"] == "remind":
        try:
            bot.edit_message_text(
                f"⏰ «{html.escape(text[:80])}» — {label}.",
                chat_id,
                call.message.message_id,
            )
        except Exception:  # noqa: BLE001
            pass
        msg = bot.send_message(
            chat_id,
            f"Во сколько напомнить ({label})? Пришли время, например 18:30",
            reply_markup=types.ForceReply(selective=False),
        )
        bot.register_next_step_handler(
            msg, _step_remind_time, pending["user_id"], text, day
        )
        bot.answer_callback_query(call.id)
        return

    if pending["dest"] == "week":
        _add_week_task(pending["user_id"], text, day)
        result = f"📅 В план на неделю ({label}): <b>{html.escape(text)}</b>"
    else:
        _add_day_task(pending["user_id"], text, day)
        result = f"🗓 В план дня ({label}): <b>{html.escape(text)}</b>"

    try:
        bot.edit_message_text(result, chat_id, call.message.message_id)
    except Exception:  # noqa: BLE001
        pass
    bot.answer_callback_query(call.id, "Готово")


def _step_remind_time(message, user_id, text, day: date):
    """Шаг 3 напоминания: получили время → создаём."""
    raw = (message.text or "").strip()
    if not raw or raw.startswith("/"):
        bot.reply_to(message, "Отменено.")
        return

    parsed = _parse_hhmm(raw)
    if parsed is None:
        msg = bot.reply_to(
            message,
            "Не понял время 🤔 Пришли в формате ЧЧ:ММ, например 18:30",
        )
        bot.register_next_step_handler(msg, _step_remind_time, user_id, text, day)
        return

    hh, mm = parsed
    remind_at = datetime(day.year, day.month, day.day, hh, mm)
    if remind_at <= datetime.now():
        msg = bot.reply_to(
            message,
            "Это время уже прошло 😅 Пришли другое (ЧЧ:ММ):",
        )
        bot.register_next_step_handler(msg, _step_remind_time, user_id, text, day)
        return

    _add_reminder(user_id, text, remind_at)
    label = f"{_RU_WD[day.weekday()]} {day.day:02d}.{day.month:02d}"
    bot.reply_to(
        message,
        f"⏰ Напомню {label} в {hh:02d}:{mm:02d}: <b>{html.escape(text)}</b>",
    )


def _reminders_menu(user_id: int) -> tuple[str, types.InlineKeyboardMarkup]:
    """Текст + клавиатура меню напоминаний: активные (тап — удалить) и «новое»."""
    items = _active_reminders(user_id)
    kb = types.InlineKeyboardMarkup()
    for r in items:
        title = r.text if len(r.text) <= 24 else r.text[:23] + "…"
        when = (
            f"{_RU_WD[r.remind_at.weekday()]} "
            f"{r.remind_at.day:02d}.{r.remind_at.month:02d} "
            f"{r.remind_at.hour:02d}:{r.remind_at.minute:02d}"
        )
        kb.add(
            types.InlineKeyboardButton(
                f"❌ {when} · {title}",
                callback_data=f"rem:del:{r.id}",
            )
        )
    kb.add(
        types.InlineKeyboardButton("➕ Новое напоминание", callback_data="rem:new")
    )
    if items:
        text = (
            f"⏰ <b>Активные напоминания</b> — {len(items)}\n\n"
            "Нажми на напоминание, чтобы удалить его."
        )
    else:
        text = "⏰ Активных напоминаний нет."
    return text, kb


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("rem:"))
def cb_reminders(call):
    chat_id = call.message.chat.id
    user_id = _user_id_for_chat(chat_id)
    if not user_id:
        bot.answer_callback_query(call.id, "Сначала привяжи аккаунт: /start КОД")
        return

    parts = call.data.split(":")
    action = parts[1] if len(parts) > 1 else ""

    if action == "new":
        bot.answer_callback_query(call.id)
        msg = bot.send_message(
            chat_id,
            "О чём напомнить? Пришли текст:",
            reply_markup=types.ForceReply(selective=False),
        )
        bot.register_next_step_handler(msg, _step_capture_name, user_id, "remind")
        return

    if action == "del" and len(parts) > 2:
        deleted = _delete_reminder(user_id, int(parts[2]))
        bot.answer_callback_query(call.id, "Удалено" if deleted else "Уже удалено")
        text, kb = _reminders_menu(user_id)
        try:
            bot.edit_message_text(
                text, chat_id, call.message.message_id, reply_markup=kb
            )
        except Exception:  # noqa: BLE001
            pass


@bot.message_handler(commands=["remind"])
def handle_remind(message):
    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(message, "Сначала привяжи аккаунт: /start КОД")
        return
    msg = bot.send_message(
        message.chat.id,
        "О чём напомнить? Пришли текст:",
        reply_markup=types.ForceReply(selective=False),
    )
    bot.register_next_step_handler(msg, _step_capture_name, user_id, "remind")


@bot.message_handler(commands=["reminders"])
def handle_reminders(message):
    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(message, "Сначала привяжи аккаунт: /start КОД")
        return
    text, kb = _reminders_menu(user_id)
    bot.send_message(message.chat.id, text, reply_markup=kb)


@bot.message_handler(commands=["add"])
def handle_add(message):
    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(message, "Сначала привяжи аккаунт: /start КОД")
        return

    parts = (message.text or "").split(maxsplit=1)
    title = parts[1].strip() if len(parts) > 1 else ""
    if not title:
        bot.reply_to(
            message,
            "Напиши текст задачи: <code>/add Купить молоко</code>\n"
            "Задача встанет в конец плана на сегодня (без жёсткого времени).",
        )
        return

    _add_day_task(user_id, title, date.today())
    bot.reply_to(message, f"🗓 Добавил в план на сегодня: <b>{html.escape(title)}</b>")


@bot.message_handler(commands=["today"])
def handle_today(message):
    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(message, "Сначала привяжи аккаунт: /start КОД")
        return
    today = date.today()
    bot.send_message(
        message.chat.id,
        _format_plan(user_id, today),
        reply_markup=_today_keyboard(user_id, today),
    )


@bot.message_handler(commands=["inbox", "in"])
def handle_inbox(message):
    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(message, "Сначала привяжи аккаунт: /start КОД")
        return

    parts = (message.text or "").split(maxsplit=1)
    text = parts[1].strip() if len(parts) > 1 else ""
    if not text:
        bot.reply_to(message, "Напиши текст: <code>/inbox Позвонить врачу</code>")
        return

    _add_inbox(user_id, text)
    bot.reply_to(message, f"📥 Во «Входящие»: <b>{html.escape(text)}</b>")


@bot.message_handler(func=lambda m: True, content_types=["text"])
def handle_text(message):
    text = (message.text or "").strip()

    # Неизвестные команды не обрабатываем как текст.
    if text.startswith("/"):
        bot.reply_to(message, "Не знаю такую команду. Список — /help")
        return

    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(
            message,
            "Сначала привяжи аккаунт: открой приложение → Аккаунт → "
            "«Подключить Telegram», затем /start КОД.",
        )
        return

    # Не считываем текст молча — спрашиваем, куда положить.
    bot.reply_to(
        message,
        f"Куда добавить «{html.escape(text[:80])}»?",
        reply_markup=_capture_keyboard(),
    )


# ---------------------------------------------------------------- callbacks


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("tgl:"))
def cb_toggle(call):
    user_id = _user_id_for_chat(call.message.chat.id)
    if not user_id:
        bot.answer_callback_query(call.id, "Аккаунт не привязан")
        return

    try:
        task_id = int(call.data.split(":", 1)[1])
    except (ValueError, IndexError):
        bot.answer_callback_query(call.id)
        return

    _toggle_day_task(user_id, task_id)
    today = date.today()
    try:
        bot.edit_message_text(
            _format_plan(user_id, today),
            call.message.chat.id,
            call.message.message_id,
            reply_markup=_today_keyboard(user_id, today),
        )
    except Exception:  # noqa: BLE001 — например, "message is not modified"
        pass
    bot.answer_callback_query(call.id, "Готово")


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("cap:"))
def cb_capture(call):
    user_id = _user_id_for_chat(call.message.chat.id)
    if not user_id:
        bot.answer_callback_query(call.id, "Аккаунт не привязан")
        return

    src = call.message.reply_to_message
    text = (src.text if src and src.text else "").strip()
    if not text:
        bot.answer_callback_query(call.id, "Текст потерялся, напиши заново")
        return

    dest = call.data.split(":", 1)[1]
    if dest == "day":
        _add_day_task(user_id, text, date.today())
        result = f"🗓 В план на сегодня: <b>{html.escape(text)}</b>"
    else:
        _add_inbox(user_id, text)
        result = f"📥 Во «Входящие»: <b>{html.escape(text)}</b>"

    try:
        bot.edit_message_text(result, call.message.chat.id, call.message.message_id)
    except Exception:  # noqa: BLE001
        pass
    bot.answer_callback_query(call.id, "Готово")


def _step_add_day(message, user_id):
    text = (message.text or "").strip()
    if not text or text.startswith("/"):
        bot.reply_to(message, "Отменено.")
        return
    _add_day_task(user_id, text, date.today())
    bot.reply_to(message, f"🗓 В план на сегодня: <b>{html.escape(text)}</b>")


def _step_add_inbox(message, user_id):
    text = (message.text or "").strip()
    if not text or text.startswith("/"):
        bot.reply_to(message, "Отменено.")
        return
    _add_inbox(user_id, text)
    bot.reply_to(message, f"📥 Во «Входящие»: <b>{html.escape(text)}</b>")


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("menu:"))
def cb_menu(call):
    user_id = _user_id_for_chat(call.message.chat.id)
    if not user_id:
        bot.answer_callback_query(call.id, "Аккаунт не привязан")
        return

    action = call.data.split(":", 1)[1]
    chat_id = call.message.chat.id
    bot.answer_callback_query(call.id)

    if action == "today":
        today = date.today()
        bot.send_message(
            chat_id,
            _format_plan(user_id, today),
            reply_markup=_today_keyboard(user_id, today),
        )
    elif action == "help":
        bot.send_message(chat_id, HELP_TEXT)
    elif action == "add":
        msg = bot.send_message(
            chat_id,
            "Что добавить в план на сегодня? Пришли текст:",
            reply_markup=types.ForceReply(selective=False),
        )
        bot.register_next_step_handler(msg, _step_add_day, user_id)
    elif action == "inbox":
        msg = bot.send_message(
            chat_id,
            "Что добавить во «Входящие»? Пришли текст:",
            reply_markup=types.ForceReply(selective=False),
        )
        bot.register_next_step_handler(msg, _step_add_inbox, user_id)


# ---------------------------------------------------------------- digest


def _send_daily_digest() -> None:
    today = date.today()
    with SessionLocal() as db:
        links = (
            db.query(TelegramLink)
            .filter(TelegramLink.chat_id.isnot(None))
            .all()
        )
        targets = [(link.chat_id, link.user_id) for link in links]

    print(f"sending daily digest to {len(targets)} chat(s)", flush=True)
    for chat_id, user_id in targets:
        try:
            bot.send_message(int(chat_id), _format_plan(user_id, today))
        except Exception as e:  # noqa: BLE001
            print(f"digest send failed for {chat_id}: {e}", flush=True)


def _digest_loop() -> None:
    """Раз в сутки в DIGEST_HOUR шлём дайджест всем привязанным.

    Тело обёрнуто в try/except: разовая ошибка (БД/сеть) не должна убивать
    поток — иначе дайджест молча перестаёт приходить, хотя бот «работает».
    """
    print(f"digest loop started (hour={DIGEST_HOUR}, tz local)", flush=True)
    sent_for: date | None = None
    while True:
        try:
            now = datetime.now()
            if now.hour == DIGEST_HOUR and sent_for != now.date():
                _send_daily_digest()
                sent_for = now.date()
        except Exception as e:  # noqa: BLE001
            print(f"digest loop error: {e}", flush=True)
        _time.sleep(60)


# ---------------------------------------------------------------- reminders


def _snooze_keyboard(reminder_id: int) -> types.InlineKeyboardMarkup:
    """Кнопки «отложить» под сработавшим напоминанием."""
    kb = types.InlineKeyboardMarkup()
    kb.row(
        types.InlineKeyboardButton("⏰ +10 мин", callback_data=f"rsnz:{reminder_id}:10"),
        types.InlineKeyboardButton("+1 час", callback_data=f"rsnz:{reminder_id}:60"),
    )
    kb.row(
        types.InlineKeyboardButton("+3 часа", callback_data=f"rsnz:{reminder_id}:180"),
        types.InlineKeyboardButton("Завтра утром", callback_data=f"rsnz:{reminder_id}:tom"),
    )
    return kb


def _snooze_reminder(user_id: int, reminder_id: int, remind_at: datetime) -> datetime | None:
    """Переносит напоминание на remind_at и возвращает его в очередь доставки.
    None — напоминание не найдено (удалено или чужое)."""
    with SessionLocal() as db:
        r = (
            db.query(Reminder)
            .filter(Reminder.id == reminder_id, Reminder.user_id == user_id)
            .first()
        )
        if r is None:
            return None
        r.remind_at = remind_at.replace(second=0, microsecond=0)
        r.sent = False
        r.sent_at = None
        db.commit()
        return r.remind_at


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("rsnz:"))
def cb_snooze(call):
    user_id = _user_id_for_chat(call.message.chat.id)
    if not user_id:
        bot.answer_callback_query(call.id, "Аккаунт не привязан")
        return

    try:
        _, rid_raw, arg = call.data.split(":", 2)
        reminder_id = int(rid_raw)
    except ValueError:
        bot.answer_callback_query(call.id)
        return

    now = datetime.now()
    if arg == "tom":
        remind_at = datetime(now.year, now.month, now.day, 9, 0) + timedelta(days=1)
    else:
        remind_at = now + timedelta(minutes=int(arg))

    new_at = _snooze_reminder(user_id, reminder_id, remind_at)
    if new_at is None:
        bot.answer_callback_query(call.id, "Напоминание уже удалено")
        return

    label = (
        f"{_RU_WD[new_at.weekday()]} {new_at.day:02d}.{new_at.month:02d} "
        f"{new_at.hour:02d}:{new_at.minute:02d}"
    )
    try:
        bot.edit_message_text(
            f"{call.message.html_text}\n\n🔁 <i>Отложено до {label}</i>",
            call.message.chat.id,
            call.message.message_id,
        )
    except Exception:  # noqa: BLE001
        pass
    bot.answer_callback_query(call.id, f"Отложено до {label}")


def _deliver_due_reminders() -> None:
    """Наступившие напоминания: колокольчик на сайте + сообщение в TG.

    Помечаем sent сразу после создания уведомления: если Telegram недоступен,
    напоминание не продублируется при следующем тике (in-app уже есть).
    """
    now = datetime.now()
    tg_targets: list[tuple[int, str, int]] = []  # (chat_id, text, reminder_id)

    with SessionLocal() as db:
        due = (
            db.query(Reminder)
            .filter(
                Reminder.sent == False,  # noqa: E712
                Reminder.remind_at <= now,
            )
            .all()
        )
        if not due:
            return

        for r in due:
            notif = Notification(
                title="Напоминание",
                message=r.text,
                created_by_user_id=r.user_id,
                audience_type="single",
            )
            db.add(notif)
            db.flush()
            db.add(
                NotificationRecipient(
                    notification_id=notif.id,
                    user_id=r.user_id,
                    is_read=False,
                )
            )

            link = (
                db.query(TelegramLink)
                .filter(
                    TelegramLink.user_id == r.user_id,
                    TelegramLink.chat_id.isnot(None),
                )
                .first()
            )
            if link:
                tg_targets.append((int(link.chat_id), r.text, r.id))

            r.sent = True
            r.sent_at = now
        db.commit()

    print(f"delivered {len(due)} reminder(s), tg={len(tg_targets)}", flush=True)
    for chat_id, text, reminder_id in tg_targets:
        try:
            bot.send_message(
                chat_id,
                f"⏰ <b>Напоминание</b>\n\n{html.escape(text)}",
                reply_markup=_snooze_keyboard(reminder_id),
            )
        except Exception as e:  # noqa: BLE001
            print(f"reminder send failed for {chat_id}: {e}", flush=True)


def _reminders_loop() -> None:
    """Каждые ~30 сек проверяем наступившие напоминания. Как и дайджест,
    тело обёрнуто в try/except, чтобы разовая ошибка не убила поток."""
    print("reminders loop started", flush=True)
    while True:
        try:
            _deliver_due_reminders()
        except Exception as e:  # noqa: BLE001
            print(f"reminders loop error: {e}", flush=True)
        _time.sleep(30)


# ---------------------------------------------------------------- entrypoint


def _set_commands() -> None:
    """Меню команд (кнопка «/» в чате)."""
    try:
        bot.set_my_commands(
            [
                types.BotCommand("menu", "Меню с кнопками"),
                types.BotCommand("today", "План на сегодня"),
                types.BotCommand("add", "Задача в план на сегодня"),
                types.BotCommand("remind", "Поставить напоминание"),
                types.BotCommand("reminders", "Активные напоминания"),
                types.BotCommand("inbox", "Добавить во «Входящие»"),
                types.BotCommand("help", "Помощь"),
            ]
        )
    except Exception as e:  # noqa: BLE001
        print(f"set_my_commands failed: {e}", flush=True)


def main() -> None:
    _set_commands()
    threading.Thread(target=_digest_loop, daemon=True).start()
    threading.Thread(target=_reminders_loop, daemon=True).start()
    print("Telegram bot started (long polling)…", flush=True)
    bot.infinity_polling(skip_pending=True, timeout=30)


if __name__ == "__main__":
    main()
