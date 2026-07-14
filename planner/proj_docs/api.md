# REST API

Полная актуальная спецификация — Swagger UI на `/docs` (OpenAPI на
`/openapi.json`) работающего backend'а. Здесь — карта эндпоинтов по доменам,
чтобы ориентироваться в `backend/routers/`.

Общее:
- фронт зовёт всё через префикс `/api` (срезается прокси — vite в dev, nginx в prod);
- авторизация: `Authorization: Bearer <JWT>`, кроме register/login/verify/legal/feedback;
- все ручки работают только с данными текущего пользователя (ownership-фильтр);
  чужой id → 404.

## auth_routes.py — аккаунт

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/auth/register` | регистрация → JWT + письмо верификации |
| GET | `/auth/verify-email?token=` | подтверждение почты |
| POST | `/auth/login` | вход → JWT (создаёт `user_sessions` c jti) |
| GET | `/auth/me` | текущий пользователь |
| PATCH | `/auth/profile` / `/auth/theme` / `/auth/day-start` / `/auth/password` | настройки профиля |
| PATCH | `/auth/reminder-settings` | настройки напоминаний (lead задач, повторы, дедлайны целей) |
| POST | `/auth/avatar` | загрузка аватара (в `/uploads`) |
| GET / DELETE | `/auth/sessions[/{id}]` | список сессий / отзыв одной / отзыв всех кроме текущей |
| GET | `/auth/export` | выгрузка всех данных аккаунта |
| DELETE | `/auth/account` | удаление аккаунта |
| POST | `/auth/import-schedule` | заглушка импорта расписания |

## day.py — план дня

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/day/{day}` | задачи дня |
| GET / PUT | `/day/{day}/settings` | время начала дня |
| POST | `/day/{day}/tasks` | создать задачу (`remind_lead_min` — напомнить за N минут) |
| PATCH / DELETE | `/day/{day}/tasks/{task_id}` | изменить / удалить (`remind_lead_min: -1` снимает напоминание) |
| POST | `/day/{day}/reorder` | порядок задач |
| GET | `/day-tasks/overdue` | просроченные (прошлые дни, не сделаны) |
| POST | `/day-tasks/{id}/reschedule` | перенести просроченную на другой день |
| DELETE | `/day-tasks/{id}/dismiss` | скрыть из просроченных |
| GET | `/week-import-candidates/{day}` | недельные задачи, подходящие на этот день |
| POST | `/day/import-week-tasks` | импорт недельных задач в дни |

## week.py — план недели

`GET/POST /week-tasks`, `GET /week-tasks/important`,
`PATCH/DELETE /week-tasks/{id}`, `POST /week-tasks/reorder`.

## inbox.py — «Входящие»

`GET/POST /inbox`, `PATCH/DELETE /inbox/{id}`,
`POST /inbox/{id}/assign-day`, `POST /inbox/{id}/assign-week`
(создают day/week-задачу со ссылкой на источник и ставят `assigned_at`).

## goals.py — цели

| Метод | Путь | Что делает |
|---|---|---|
| GET / POST | `/goals` | список / создание |
| PATCH / DELETE | `/goals/{id}` | изменить / удалить |
| PATCH | `/goals/{id}/focus` | переключить фокус-цель |
| POST | `/goals/reorder` | порядок |
| POST / PATCH / DELETE | `/goals/{id}/stages[/{stage_id}]` | этапы |
| GET | `/goals/week` / `/goals/day/{day}` | цели для недельного/дневного вида |
| PATCH | `/goals/week-item/toggle` / `/goals/day-item/toggle` | отметки выполнения (goal_checkins) |

## notifications.py — уведомления и напоминания

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/notifications` | мои уведомления (колокольчик) |
| GET | `/notifications/unread-count` | счётчик на бейдже |
| PATCH | `/notifications/{id}/read` / `/notifications/read-all` | прочитано |
| DELETE | `/notifications/{id}` | скрыть уведомление |
| POST | `/notifications/send` | (админ) рассылка single/group/all |
| GET | `/notifications/users` | (админ) список получателей |
| POST | `/notifications/overdue-reminder` | уведомление о просроченных задачах |
| GET / POST | `/reminders` | список / создание (+ `recur_every`/`recur_unit` для повторяющихся) |
| POST | `/reminders/{id}/snooze` | отложить на `{minutes: 1..10080}` (см. [reminders.md](reminders.md)) |
| POST | `/reminders/{id}/ack` | ответ `{status: done\|read}`: стоп повторов; done отмечает задачу-источник |
| DELETE | `/reminders/{id}` | удалить напоминание |

## Остальное

- **telegram.py**: `GET /telegram/status`, `POST /telegram/link-code`
  (одноразовый код привязки), `DELETE /telegram/link`.
- **categories.py**: CRUD `/categories`.
- **templates.py**: CRUD `/day-templates` + `POST /day-templates/{id}/apply/{day}`;
  CRUD `/week-templates` + `POST /week-templates/{id}/apply`.
- **notes.py**: `GET/PUT /day-notes/{day}` (upsert).
- **statistics.py**: `GET /statistics`.
- **feedback.py**: `POST /feedback` (доступно без логина), `GET /feedback`
  (админ), `GET /feedback/my`, `PATCH /feedback/{id}` (статус),
  `PATCH /feedback/{id}/reply` (ответ разработчика).
- **legal.py**: тексты соглашений (`/legal/*`, plain text).
