export async function handleResponse(res, errorText) {
  if (res.status === 401) {
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
