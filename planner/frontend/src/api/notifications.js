const API_URL = "/api";

function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem("access_token");

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(res, errorText) {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || errorText);
  }

  return await res.json();
}

export async function fetchMyNotifications() {
  const res = await fetch(`${API_URL}/notifications`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch notifications");
}

export async function markNotificationRead(notificationId) {
  const res = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
  });

  return await handleResponse(res, "Failed to mark notification as read");
}

export async function fetchUsersForNotifications() {
  const res = await fetch(`${API_URL}/notifications/users`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch users");
}

export async function sendNotification(body) {
  const res = await fetch(`${API_URL}/notifications/send`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to send notification");
}