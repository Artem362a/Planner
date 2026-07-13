import { handleResponse } from "./client";

const API_URL = "/api";

function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem("access_token");

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchReminders() {
  const res = await fetch(`${API_URL}/reminders`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch reminders");
}

export async function createReminder(body) {
  const res = await fetch(`${API_URL}/reminders`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to create reminder");
}

export async function deleteReminder(reminderId) {
  const res = await fetch(`${API_URL}/reminders/${reminderId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to delete reminder");
}

export async function snoozeReminder(reminderId, minutes) {
  const res = await fetch(`${API_URL}/reminders/${reminderId}/snooze`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ minutes }),
  });

  return await handleResponse(res, "Failed to snooze reminder");
}
