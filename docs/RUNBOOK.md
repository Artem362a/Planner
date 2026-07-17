# RUNBOOK — что делать, когда всё сломалось

Топология: браузер → nginx на VDS (185.68.21.222, HTTPS, статика фронта
в /var/www/planner) → 127.0.0.1:8080 (frps) → frpc на ноуте → uvicorn
в docker (127.0.0.1:8000). Postgres и бот — тоже в docker на ноуте.
Мониторинг (Prometheus/Grafana/Loki/Alertmanager) — docker на ноуте.

## Как деплоится

Автоматически: merge в `main` → CI (5 джобов) → при зелёном CI запускается
Deploy (`.github/workflows/deploy.yml`):

- **backend** — на self-hosted раннере ноута: бэкап БД → `git reset --hard
  origin/main` в `~/Planner` → `docker compose up -d --build backend bot` →
  `alembic upgrade head` → health check на `127.0.0.1:8000/docs`.
- **frontend** — на облачном раннере: Vite-билд → scp на VDS →
  подмена /var/www/planner (старая версия остаётся рядом,
  хранятся 3 бэкапа `/var/www/planner.bak.*`).

Руками деплоить не надо. Если очень надо — те же шаги по ssh.

## Как откатиться

1. `git revert <плохой коммит>` (или `git revert -m 1 <merge-коммит>`),
   пуш в `main` — CD сам накатит предыдущее состояние кода.
2. Если миграция изменила схему и новая схема несовместима со старым кодом:
   на ноуте `docker compose exec backend alembic downgrade -1`
   (см. `docker compose exec backend alembic history`).
3. Фронт можно откатить мгновенно без git: на VDS
   `cp -a /var/www/planner.bak.<дата>/. /var/www/planner/`.

## Восстановление БД из бэкапа

Бэкапы делает `~/backup.sh` на ноуте (и он же дёргается перед каждым деплоем).

```bash
# посмотреть бэкапы
ls -lt ~/backups | head
# восстановить (СНАЧАЛА остановить писателей!)
docker compose stop backend bot
gunzip -c ~/backups/<файл>.sql.gz | docker compose exec -T postgres psql -U dayplan_user -d dayplan
docker compose start backend bot
```

## Если сайт лежит

Проверять по цепочке снаружи внутрь:

1. **VDS жив?** `ssh root@185.68.21.222`, `systemctl status nginx frps`.
2. **Туннель жив?** на VDS: `curl -s 127.0.0.1:8080/docs` — если ответил,
   туннель и бэкенд живы, проблема в nginx/сертификате.
3. **Ноут жив?** на ноуте: `docker compose ps` — все ли `Up (healthy)`;
   `systemctl --user status frpc` / `systemctl status frpc` (как настроен).
4. **Бэкенд жив?** на ноуте: `curl -s 127.0.0.1:8000/docs`,
   логи: `docker logs dayplan-backend --tail 100` или Grafana → DayPlan API →
   панель «Логи бэкенда» (фильтр level=error).
5. **Postgres:** `docker logs dayplan-postgres --tail 50`,
   `docker compose exec postgres pg_isready`.

## Если молчит бот / не приходят напоминания

1. `docker logs dayplan-bot --tail 100`.
2. Telegram из RU заблокирован — бот ходит через xray SOCKS
   (`TELEGRAM_PROXY`). Проверить, что xray жив на хосте: `ss -lnt | grep <порт>`.
3. Помнить: `sent` у напоминания ставится ДО отправки в TG — если бот упал
   между, напоминание потеряно (известная особенность).

## Мониторинг

- Grafana: `127.0.0.1:3000` на ноуте (логин admin, пароль в корневом `.env`
  ноута, `GRAFANA_ADMIN_PASSWORD`). Дашборды: **DayPlan API** (RPS,
  латентность, ошибки, логи) и **DayPlan Server** (CPU/RAM/диск/сеть).
- Prometheus: `127.0.0.1:9090` (Status → Targets — все ли скрейпятся).
- Алерты: правила в `deploy/monitoring/alerts.yml`, шлются Alertmanager'ом
  в Telegram (`TELEGRAM_ALERT_CHAT_ID` в `planner/backend/.env`).
  Пороги выставлены на глаз — после пары недель данных подкрутить.
- `/api/metrics` наружу закрыт nginx'ом (404) — метрики только для
  внутреннего Prometheus.

Алерты и что делать:

| Алерт | Значит | Первое действие |
|---|---|---|
| BackendDown | Prometheus не видит бэкенд ≥1 мин | `docker compose ps`, `docker logs dayplan-backend` |
| High5xxRate | >5 ошибок 5xx за 5 мин | Grafana → логи, level=error, смотреть traceback по request_id |
| HighLatency | p95 > 1s 10 минут | Grafana → «Самые медленные эндпоинты»; нагрузка на ноут (Server-дашборд) |
| DiskAlmostFull | диск >80% 15 мин | `docker system prune -f`, чистка старых `~/backups` |
| HostOutOfMemory | <10% RAM 10 мин | `docker stats` — кто ест; перезапуск виновника |

## Rate limiting

`/auth/login` — 10/мин, `/auth/register` — 5/мин с одного IP
(IP берётся из `X-Forwarded-For`, который ставит nginx на VDS).
Хранилище — память процесса: при 2 воркерах фактический потолок ×2.
Выключатель: `RATE_LIMIT_ENABLED=0` (нужен только в тестах).

## Нагрузочное тестирование

`k6 run deploy/k6/api-load.js` — ТОЛЬКО по локальному стеку
(`BASE_URL=http://localhost:8000` по умолчанию). Пороги: p95 < 500 мс,
ошибок < 1%. По результатам тюнить `--workers` uvicorn в Dockerfile.

## Известные особенности прода

- На ноуте лежит `docker-compose.override.yml` (НЕ в git): переводит `bot`
  (и `alertmanager` — для доступа к xray на 127.0.0.1) на
  `network_mode: host` и перенацеливает их DATABASE_URL/порты.
- Приложение работает в наивном локальном времени — `TZ=Europe/Samara`
  обязателен во всех контейнерах приложения.
- На VDS в sites-enabled остался мёртвый сайт `dayplan` — подлежит удалению.
- Раннер: `actions.runner.*.dayplan-laptop.service` (systemd, ноут).
