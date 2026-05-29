export async function handleResponse(res, errorText, options = {}) {
  // On most endpoints a 401 means the token expired — clear it and bounce to login.
  // Auth endpoints (login, password change, account deletion) return 401 for a wrong
  // password instead, so they pass skipAuthRedirect to surface the error normally.
  if (res.status === 401 && !options.skipAuthRedirect) {
    localStorage.removeItem("access_token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || errorText);
  }
  return res.json();
}
