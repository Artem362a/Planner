# Telegram-бот планировщика

Тонкий слой поверх той же БД, что и бэкенд. Работает через long polling
(за NAT, без вебхуков). Запускается на том же хосте, что и бэкенд.

## Что умеет (MVP)

- **Привязка аккаунта**: `/start <код>`. Код берётся в вебе: Аккаунт →
  «Подключить Telegram».
- **Быстрый захват**: любое текстовое сообщение → запись во «Входящие».
- **`/today`**: план на сегодня.
- **Ежедневный дайджест**: план дня + число просроченных задач, в
  `TELEGRAM_DIGEST_HOUR` (по умолчанию 8 утра, время сервера).

## Настройка

1. Создать бота у **@BotFather** → `/newbot` → получить **токен** и **username**.
   Желательно `/setprivacy` → **Disable**, чтобы бот видел обычные сообщения
   (для захвата во «Входящие» в личке это и так работает).

2. В `planner/backend/.env` добавить:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_BOT_USERNAME=my_planner_bot      # без @
   TELEGRAM_DIGEST_HOUR=8                      # опционально
   ```

3. Поставить зависимость бота в venv бэкенда (новый только telebot):
   ```bash
   planner/backend/.venv/bin/pip install pyTelegramBotAPI
   ```

## Запуск

Вручную:
```bash
planner/backend/.venv/bin/python planner/bot/bot.py
```

Как сервис (см. `deploy/planner-bot.service`):
```bash
sudo cp deploy/planner-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now planner-bot.service
sudo systemctl status planner-bot.service
journalctl -u planner-bot.service -f
```

## Привязка аккаунта (для пользователя)

Аккаунт → «Подключить Telegram» → «Открыть бота и привязать» (или вручную
`/start <код>` в боте). Код живёт 15 минут.
