import { handleResponse } from "./client";

const API_URL = "/api";

function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem("access_token");
  return { ...extraHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function fetchStatistics(periodDays = 30) {
  const res = await fetch(`${API_URL}/statistics?period_days=${periodDays}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(res, "Ошибка загрузки статистики");
}
