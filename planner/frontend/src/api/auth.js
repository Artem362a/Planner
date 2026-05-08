//const API_URL = "http://127.0.0.1:8000";
const API_URL = "/api";

async function handleResponse(res, errorText) {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || errorText);
  }

  return await res.json();
}

function getAuthHeaders(extraHeaders = {}) {
  const token = getToken();

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function registerUser(body) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to register");
}

export async function loginUser(body) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to login");
}

export async function fetchMe(token) {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await handleResponse(res, "Failed to fetch user");
}

export async function updateProfile(body) {
  const res = await fetch(`${API_URL}/auth/profile`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to update profile");
}

export async function updatePassword(body) {
  const res = await fetch(`${API_URL}/auth/password`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to update password");
}

export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/auth/avatar`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  return await handleResponse(res, "Failed to upload avatar");
}

export function saveToken(token) {
  localStorage.setItem("access_token", token);
}

export function getToken() {
  return localStorage.getItem("access_token");
}

export function removeToken() {
  localStorage.removeItem("access_token");
}
export async function verifyEmail(token) {
  const res = await fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`);

  return await handleResponse(res, "Failed to verify email");
}
