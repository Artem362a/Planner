import { getToken } from "./auth";
import { handleResponse } from "./client";

const API_URL = "/api";

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchScheduleSubscription() {
  const res = await fetch(`${API_URL}/schedule/subscription`, {
    headers: authHeaders(),
  });
  return handleResponse(res, "Не удалось загрузить настройки расписания");
}

export async function saveScheduleSubscription(body) {
  const res = await fetch(`${API_URL}/schedule/subscription`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return handleResponse(res, "Не удалось подключить расписание");
}

export async function syncScheduleNow() {
  const res = await fetch(`${API_URL}/schedule/sync`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse(res, "Не удалось обновить расписание");
}

export async function disconnectSchedule(removeFutureTasks = false) {
  const params = new URLSearchParams({
    remove_future_tasks: String(removeFutureTasks),
  });
  const res = await fetch(`${API_URL}/schedule/subscription?${params}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse(res, "Не удалось отключить расписание");
}

export async function fetchScheduleWeek(weekStart, lessonType = "all") {
  const params = new URLSearchParams({
    week_start: weekStart,
    lesson_type: lessonType,
  });
  const res = await fetch(`${API_URL}/schedule/week?${params}`, {
    headers: authHeaders(),
  });
  return handleResponse(res, "Не удалось загрузить расписание на неделю");
}
