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

import os
import sys
import threading
import time as _time
from datetime import date, datetime, timedelta
from pathlib import Path

import telebot
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


def _format_plan(user_id: int, day: date) -> str:
    tasks = _today_tasks(user_id, day)
    if not tasks:
        return "На сегодня задач нет 🙌"

    lines = ["<b>План на сегодня:</b>"]
    for t in tasks:
        mark = "✅" if t.status == 1 else "▫️"
        when = ""
        if t.start_time:
            when = f" <i>{t.start_time.strftime('%H:%M')}</i>"
        lines.append(f"{mark} {t.title}{when}")

    overdue = _overdue_count(user_id, day)
    if overdue:
        lines.append(f"\n⚠️ Просрочено задач: <b>{overdue}</b>")
    return "\n".join(lines)


# ---------------------------------------------------------------- handlers


@bot.message_handler(commands=["start"])
def handle_start(message):
    parts = (message.text or "").split(maxsplit=1)
    code = parts[1] if len(parts) > 1 else ""

    if code and _try_link(message.chat.id, code):
        bot.reply_to(
            message,
            "✅ Готово! Аккаунт привязан.\n\n"
            "Теперь пиши мне что угодно — это попадёт во «Входящие». "
            "Команда /today покажет план на сегодня.",
        )
        return

    if _user_id_for_chat(message.chat.id):
        bot.reply_to(message, "Этот чат уже привязан 👍 Пиши задачи или жми /today.")
        return

    bot.reply_to(
        message,
        "Привет! Чтобы привязать аккаунт:\n"
        "1. Открой приложение → Аккаунт → «Подключить Telegram».\n"
        "2. Нажми на ссылку или пришли мне код командой <code>/start КОД</code>.",
    )


@bot.message_handler(commands=["help"])
def handle_help(message):
    bot.reply_to(
        message,
        "Что я умею:\n"
        "• любое сообщение → добавлю во «Входящие»\n"
        "• /today — план на сегодня\n"
        "• /start КОД — привязать аккаунт",
    )


@bot.message_handler(commands=["today"])
def handle_today(message):
    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(message, "Сначала привяжи аккаунт: /start КОД")
        return
    bot.send_message(message.chat.id, _format_plan(user_id, date.today()))


@bot.message_handler(func=lambda m: True, content_types=["text"])
def handle_text(message):
    user_id = _user_id_for_chat(message.chat.id)
    if not user_id:
        bot.reply_to(
            message,
            "Сначала привяжи аккаунт: открой приложение → Аккаунт → "
            "«Подключить Telegram», затем /start КОД.",
        )
        return

    _add_inbox(user_id, message.text)
    bot.reply_to(message, "📥 Добавил во «Входящие»")


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


def main() -> None:
    threading.Thread(target=_digest_loop, daemon=True).start()
    print("Telegram bot started (long polling)…", flush=True)
    bot.infinity_polling(skip_pending=True, timeout=30)


if __name__ == "__main__":
    main()
