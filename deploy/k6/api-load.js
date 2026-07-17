// Нагрузочный тест API. Гонять ТОЛЬКО по локальному стеку, не по проду:
//   docker compose up -d
//   k6 run deploy/k6/api-load.js
// Переменные (по умолчанию — локальный compose):
//   k6 run -e BASE_URL=http://localhost:8000 -e EMAIL=... -e PASSWORD=... deploy/k6/api-load.js
// Тестовый пользователь должен существовать (создаётся сам при первом прогоне).
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8000";
const EMAIL = __ENV.EMAIL || "k6-loadtest@test.local";
const PASSWORD = __ENV.PASSWORD || "k6-loadtest-password";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 20 },
    { duration: "30s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

// Один логин на весь прогон: у /auth/login лимит 10/мин с одного IP,
// поэтому токен получаем в setup и раздаём всем VU.
export function setup() {
  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (login.status === 200) {
    return { token: login.json("access_token") };
  }
  // Пользователя ещё нет — регистрируем.
  const reg = http.post(
    `${BASE}/auth/register`,
    JSON.stringify({ email: EMAIL, username: "k6loadtest", password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (reg.status !== 200) {
    throw new Error(`cannot login (${login.status}) or register (${reg.status}) test user`);
  }
  return { token: reg.json("access_token") };
}

export default function (data) {
  const params = { headers: { Authorization: `Bearer ${data.token}` } };
  const today = new Date().toISOString().slice(0, 10);

  check(http.get(`${BASE}/auth/me`, params), { "me 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/day/${today}`, params), { "day 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/statistics?period_days=30`, params), { "stats 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/goals`, params), { "goals 200": (r) => r.status === 200 });

  sleep(1);
}
