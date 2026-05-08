const API_URL = "/api";

function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem("access_token");
  return { ...extraHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function handleResponse(res, errorText) {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || errorText);
  }
  return res.json();
}

export async function fetchStatistics(periodDays = 30) {
  const res = await fetch(`${API_URL}/statistics?period_days=${periodDays}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(res, "Ошибка загрузки статистики");
}
