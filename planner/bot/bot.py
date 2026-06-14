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

from db import DayTask, InboxTask, SessionLocal, TelegramLink  # noqa: E402

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


def _today_tasks(user_id: int, day: date) -> list[DayTask]:
    with SessionLocal() as db:
        return (
            db.query(DayTask)
            .filter(DayTask.user_id == user_id, DayTask.day == day)
            .order_by(DayTask.order_index.asc())
            .all()
        )


def _overdue_count(user_id: int, day: date) -> int:
    with SessionLocal() as db:
        return (
            db.query(DayTask)
            .filter(
                DayTask.user_id == user_id,
                DayTask.day < day,
                DayTask.status == 0,
            )
            .count()
        )


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
BTN_ADD = "➕ В план"
BTN_INBOX = "📥 Входящие"
BTN_HELP = "❓ Помощь"
MAIN_LABELS = {BTN_TODAY, BTN_ADD, BTN_INBOX, BTN_HELP}


def _main_reply_kb() -> types.ReplyKeyboardMarkup:
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row(BTN_TODAY, BTN_ADD)
    kb.row(BTN_INBOX, BTN_HELP)
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
    "Что я умею:\n"
    "• <b>/menu</b> → меню с кнопками\n"
    "• <b>напиши текст</b> → спрошу: во «Входящие» или в план дня\n"
    "• <b>/inbox текст</b> → сразу во «Входящие»\n"
    "• <b>/add текст</b> → сразу в план на сегодня\n"
    "• <b>/today</b> → план на сегодня (кнопки ✅ отмечают задачи)\n"
    "• <b>/start КОД</b> → привязать аккаунт"
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
    elif label == BTN_ADD:
        msg = bot.send_message(
            message.chat.id,
            "Что добавить в план на сегодня? Пришли текст:",
            reply_markup=types.ForceReply(selective=False),
        )
        bot.register_next_step_handler(msg, _step_add_day, user_id)
    elif label == BTN_INBOX:
        msg = bot.send_message(
            message.chat.id,
            "Что добавить во «Входящие»? Пришли текст:",
            reply_markup=types.ForceReply(selective=False),
        )
        bot.register_next_step_handler(msg, _step_add_inbox, user_id)


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

    for chat_id, user_id in targets:
        try:
            bot.send_message(int(chat_id), _format_plan(user_id, today))
        except Exception as e:  # noqa: BLE001
            print(f"digest send failed for {chat_id}: {e}", flush=True)


def _digest_loop() -> None:
    """Раз в сутки в DIGEST_HOUR шлём дайджест всем привязанным."""
    sent_for: date | None = None
    while True:
        now = datetime.now()
        if now.hour == DIGEST_HOUR and sent_for != now.date():
            _send_daily_digest()
            sent_for = now.date()
        _time.sleep(60)


# ---------------------------------------------------------------- entrypoint


def _set_commands() -> None:
    """Меню команд (кнопка «/» в чате)."""
    try:
        bot.set_my_commands(
            [
                types.BotCommand("menu", "Меню с кнопками"),
                types.BotCommand("today", "План на сегодня"),
                types.BotCommand("add", "Задача в план на сегодня"),
                types.BotCommand("inbox", "Добавить во «Входящие»"),
                types.BotCommand("help", "Помощь"),
            ]
        )
    except Exception as e:  # noqa: BLE001
        print(f"set_my_commands failed: {e}", flush=True)


def main() -> None:
    _set_commands()
    threading.Thread(target=_digest_loop, daemon=True).start()
    print("Telegram bot started (long polling)…", flush=True)
    bot.infinity_polling(skip_pending=True, timeout=30)


if __name__ == "__main__":
    main()
