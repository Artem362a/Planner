# Сценарии работы пользователя

Диаграммы основных пользовательских потоков. Детали по напоминаниям —
в [reminders.md](reminders.md).

## Регистрация и вход

```mermaid
flowchart TD
    A[Регистрация:<br/>email + username + пароль] --> B["POST /auth/register<br/>→ JWT сразу"]
    B --> C[Письмо со ссылкой<br/>верификации]
    C --> D["GET /auth/verify-email?token<br/>→ email_verified = true"]
    A2[Вход] --> E["POST /auth/login → JWT<br/>+ строка в user_sessions (jti)"]
    E --> F[Токен в localStorage,<br/>все запросы с Bearer]
    F --> G["Выход/отзыв сессии =<br/>удаление строки user_sessions"]
```

## Планирование: Входящие → Неделя → День

Основной цикл работы с задачами:

```mermaid
flowchart LR
    IDEA[Идея/задача] --> INBOX["«Входящие» (inbox)<br/>из веба или бота"]
    INBOX -->|assign-day| DAY[План дня]
    INBOX -->|assign-week| WEEK[План недели]
    WEEK -->|import-week-tasks| DAY
    TPL[Шаблон дня/недели] -->|apply| DAY
    TPL -->|apply| WEEK
    DAY --> DONE{Выполнена?}
    DONE -->|да| STAT[Статистика<br/>+ completed_at у inbox-источника]
    DONE -->|день прошёл, нет| OVERDUE[Просроченные]
    OVERDUE -->|reschedule| DAY
    OVERDUE -->|dismiss| HIDDEN[Скрыта]
```

- Задача дня помнит источник (`source_week_task_id` / `source_inbox_task_id`) —
  выполнение отражается на недельной задаче и во «Входящих».
- У дня есть настраиваемое время начала (сетка планировщика) и заметка.
- Категории задач — свои у каждого пользователя, дефолтный набор создаётся
  при регистрации.

## Цели

```mermaid
flowchart TD
    G[Создать цель] --> T{Тип}
    T -->|one_time| S["Этапы (stages) с датами<br/>+ дедлайн target_date"]
    T -->|повторяющаяся| R["repeat_unit + расписание<br/>(schedule_mode)"]
    S --> PLAN[Этапы попадают в<br/>дневной/недельный вид]
    R --> CHK["Отметки по датам<br/>(goal_checkins) из плана дня/недели"]
    G --> F[Фокус-цель — выделена в UI]
```

## Привязка Telegram

```mermaid
sequenceDiagram
    participant W as Веб (аккаунт)
    participant B as Backend
    participant T as Бот
    W->>B: POST /telegram/link-code
    B-->>W: одноразовый код (с TTL)
    Note over W,T: пользователь открывает бота
    T->>T: /start → просит код
    T->>B: код + chat_id (через общую БД)
    B-->>T: telegram_links: chat_id привязан
    Note over T: теперь: дайджест, напоминания,<br/>добавление задач из чата
```

## Бот: ежедневная работа

Команды: `/menu`, `/today`, `/add`, `/remind`, `/reminders`, `/inbox`, `/help` +
reply-клавиатура с основными действиями.

```mermaid
flowchart TD
    M["/menu — кнопки"] --> TODAY["/today: план на сегодня,<br/>чекбоксы-переключатели статуса"]
    M --> ADD["/add: задача в план дня<br/>(выбор дня из пикера)"]
    M --> INB["/inbox: текст → во «Входящие»"]
    M --> REM["/remind: текст + время<br/>→ напоминание"]
    DIGEST["Дайджест в DIGEST_HOUR (8:00):<br/>план дня всем привязанным"] -.-> TODAY
```

## Напоминание: от создания до ответа

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant W as Веб (колокольчик)
    participant B as Backend
    participant L as Бот: reminders loop (30 c)
    participant T as Telegram

    U->>W: текст + дата/время<br/>(+ повторяемость: каждые N дн/нед/мес)
    W->>B: POST /reminders
    Note over L: remind_at наступил, sent=false
    L->>B: Notification + Recipient (в колокольчик)
    L->>T: ⏰ сообщение: ✅ Сделано / 👀 Прочитано + снуз
    L->>B: sent=true, sent_at=now
    alt Ответ
        U->>T: ✅ Сделано / 👀 Прочитано
        T->>B: ack; done у задачного — задача выполнена;<br/>повторяющееся → на следующий цикл
    else Снуз (TG или веб-чипы +15м/+1ч/+1д)
        U->>T: «+10 мин … Завтра утром»
        T->>B: remind_at сдвинут, sent=false — сработает снова
    else Молчание
        Note over L: через reminder_repeat_min —<br/>🔔 повтор (до reminder_repeat_max раз)
    end
```

Задача дня с чекбоксом «напомнить за N минут» автоматически получает такое же
напоминание (двигается вместе с задачей); о дедлайнах целей бот предупреждает
за `goal_deadline_days` дней и в сам день. Всё настраивается в аккаунте,
детали — в [reminders.md](reminders.md).

## Обратная связь

```mermaid
flowchart LR
    U[Форма фидбека<br/>можно без логина, со скриншотами] --> B["POST /feedback (status=new)"]
    B --> ADM["Админ: инбокс фидбека<br/>GET /feedback"]
    ADM --> REPLY["PATCH /feedback/{id}/reply"]
    REPLY --> MY["Пользователь видит ответ<br/>в GET /feedback/my"]
```
