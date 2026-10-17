import { handleResponse } from "./client";

async function request(path, options = {}) {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  return handleResponse(response, "Не удалось сохранить или загрузить успехи");
}

export function setDailySuccessesEnabled(enabled) {
  return request("/experimental/daily-successes", { method: "PUT", body: JSON.stringify({ enabled }) });
}

export function fetchDailySuccesses({ startDate, endDate, categoryIds = [], offset = 0, limit = 50 } = {}) {
  const query = new URLSearchParams({ offset, limit });
  if (startDate) query.set("start_date", startDate);
  if (endDate) query.set("end_date", endDate);
  for (const id of categoryIds) {
    if (id === "none") query.set("uncategorized", "true");
    else query.append("category_ids", id);
  }
  return request(`/daily-successes?${query}`);
}

export function fetchDailySuccessesSummary({ startDate, endDate } = {}) {
  const query = new URLSearchParams();
  if (startDate) query.set("start_date", startDate);
  if (endDate) query.set("end_date", endDate);
  return request(`/daily-successes/summary?${query}`);
}

export function saveDailySuccess(body, id) {
  return request(`/daily-successes${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST", body: JSON.stringify(body),
  });
}

export function deleteDailySuccess(id) {
  return request(`/daily-successes/${id}`, { method: "DELETE" });
}
