import { handleResponse } from "./client";

const API_URL = "/api";

function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem("access_token");
  return { ...extraHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function fetchStatistics(
  periodDays = 30,
  { startDate = null, endDate = null, allTime = false } = {},
) {
  const params = new URLSearchParams({ period_days: String(periodDays) });
  if (startDate && !allTime) params.set("start_date", startDate);
  if (endDate && !allTime) params.set("end_date", endDate);
  if (allTime) params.set("all_time", "true");

  const res = await fetch(`${API_URL}/statistics?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(res, "Ошибка загрузки статистики");
}
