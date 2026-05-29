import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleResponse } from "./client";

function makeRes(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn(async () => body),
  };
}

let originalLocation;

beforeEach(() => {
  originalLocation = window.location;
  // jsdom refuses real navigation, so swap in a plain settable object.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "http://localhost/" },
  });
  localStorage.setItem("access_token", "stored-token");
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
  localStorage.clear();
});

describe("handleResponse", () => {
  it("returns parsed JSON on a 2xx response", async () => {
    const res = makeRes(200, { id: 1, name: "ok" });
    await expect(handleResponse(res, "fail")).resolves.toEqual({ id: 1, name: "ok" });
  });

  it("on 401 clears the token and redirects to /login", async () => {
    const res = makeRes(401, { detail: "Unauthorized" });
    await expect(handleResponse(res, "fail")).rejects.toThrow("Unauthorized");
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("with skipAuthRedirect, a 401 surfaces the server error instead of redirecting", async () => {
    const res = makeRes(401, { detail: "Invalid email or password" });
    await expect(
      handleResponse(res, "Failed to login", { skipAuthRedirect: true })
    ).rejects.toThrow("Invalid email or password");
    // No redirect, token left intact for the caller to handle.
    expect(localStorage.getItem("access_token")).toBe("stored-token");
    expect(window.location.href).toBe("http://localhost/");
  });

  it("throws the server-provided detail on a non-401 error", async () => {
    const res = makeRes(400, { detail: "Title is required" });
    await expect(handleResponse(res, "fallback")).rejects.toThrow("Title is required");
  });

  it("falls back to errorText when the error body has no detail", async () => {
    const res = makeRes(500, {});
    await expect(handleResponse(res, "Something broke")).rejects.toThrow("Something broke");
  });

  it("falls back to errorText when the error body is not JSON", async () => {
    const res = {
      status: 502,
      ok: false,
      json: vi.fn(async () => {
        throw new Error("not json");
      }),
    };
    await expect(handleResponse(res, "Gateway error")).rejects.toThrow("Gateway error");
  });
});
