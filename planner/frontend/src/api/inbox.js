const API_URL = "/api";

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem("access_token");
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(res, errorText) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || errorText);
  }
  return res.json();
}

export async function fetchInboxTasks() {
  const res = await fetch(`${API_URL}/inbox`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(res, "Failed to fetch inbox tasks");
}

export async function createInboxTask(body) {
  const res = await fetch(`${API_URL}/inbox`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return handleResponse(res, "Failed to create inbox task");
}

export async function updateInboxTask(taskId, body) {
  const res = await fetch(`${API_URL}/inbox/${taskId}`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return handleResponse(res, "Failed to update inbox task");
}

export async function deleteInboxTask(taskId) {
  const res = await fetch(`${API_URL}/inbox/${taskId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return handleResponse(res, "Failed to delete inbox task");
}

export async function assignInboxToDay(taskId, day) {
  const res = await fetch(`${API_URL}/inbox/${taskId}/assign-day`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ day }),
  });
  return handleResponse(res, "Failed to assign inbox task to day");
}

export async function assignInboxToWeek(taskId, weekStart) {
  const res = await fetch(`${API_URL}/inbox/${taskId}/assign-week`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ week_start: weekStart }),
  });
  return handleResponse(res, "Failed to assign inbox task to week");
}
