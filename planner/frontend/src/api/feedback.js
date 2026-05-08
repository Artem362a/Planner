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

export async function submitFeedback({ category, type, name, contact, message, screenshots = [] }) {
  const formData = new FormData();
  formData.append("category", category);
  formData.append("type", type);
  if (name) formData.append("name", name);
  if (contact) formData.append("contact", contact);
  formData.append("message", message);
  for (const file of screenshots) {
    formData.append("screenshots", file);
  }

  const res = await fetch(`${API_URL}/feedback`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  return await handleResponse(res, "Failed to submit feedback");
}

export async function fetchFeedbackList() {
  const res = await fetch(`${API_URL}/feedback`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch feedback");
}


export async function updateFeedbackStatus(feedbackId, status) {
  const res = await fetch(`${API_URL}/feedback/${feedbackId}`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status }),
  });

  return await handleResponse(res, "Failed to update feedback status");
}
export async function fetchMyFeedbackList() {
  const res = await fetch(`${API_URL}/feedback/my`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch my feedback");
}
export async function replyToFeedback(feedbackId, reply) {
  const res = await fetch(`${API_URL}/feedback/${feedbackId}/reply`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ reply }),
  });

  return await handleResponse(res, "Failed to reply to feedback");
}