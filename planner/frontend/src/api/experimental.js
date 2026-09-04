import { handleResponse } from "./client";

const API_URL = "/api";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("access_token");
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchMcpStatus() {
  const res = await fetch(`${API_URL}/experimental/mcp/status`, {
    headers: authHeaders(),
  });
  return handleResponse(res, "Не удалось получить статус MCP");
}

export async function fetchMcpAllowlist(query = "") {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const res = await fetch(`${API_URL}/experimental/mcp/allowlist${search}`, {
    headers: authHeaders(),
  });
  return handleResponse(res, "Не удалось загрузить allowlist");
}

export async function setMcpAllowlistAccess(userId, enabled) {
  const res = await fetch(`${API_URL}/experimental/mcp/allowlist/${userId}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ enabled }),
  });
  return handleResponse(res, "Не удалось изменить доступ к MCP");
}

export async function fetchMcpConnections() {
  const res = await fetch(`${API_URL}/experimental/mcp/connections`, {
    headers: authHeaders(),
  });
  return handleResponse(res, "Не удалось загрузить подключения ИИ");
}

export async function revokeMcpConnection(grantId) {
  const res = await fetch(`${API_URL}/experimental/mcp/connections/${grantId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse(res, "Не удалось отозвать подключение");
}

export async function fetchMcpAudit(limit = 50) {
  const res = await fetch(`${API_URL}/experimental/mcp/audit?limit=${limit}`, {
    headers: authHeaders(),
  });
  return handleResponse(res, "Не удалось загрузить историю MCP");
}

export async function fetchOAuthRequest(requestId) {
  const res = await fetch(
    `${API_URL}/experimental/mcp/oauth-requests/${encodeURIComponent(requestId)}`,
    { headers: authHeaders() }
  );
  return handleResponse(res, "Запрос подключения истёк или недействителен");
}

export async function approveOAuthRequest(requestId, scopes) {
  const res = await fetch(
    `${API_URL}/experimental/mcp/oauth-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ scopes }),
    }
  );
  return handleResponse(res, "Не удалось разрешить подключение");
}

export async function denyOAuthRequest(requestId) {
  const res = await fetch(
    `${API_URL}/experimental/mcp/oauth-requests/${encodeURIComponent(requestId)}/deny`,
    { method: "POST", headers: authHeaders() }
  );
  return handleResponse(res, "Не удалось отклонить подключение");
}
