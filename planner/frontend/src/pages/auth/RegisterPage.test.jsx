import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RegisterPage from "./RegisterPage";
import { registerUser } from "../../api/auth";

vi.mock("../../api/auth", () => ({ registerUser:vi.fn(), saveToken:vi.fn() }));
let root,container;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); container=document.createElement("div"); document.body.append(container); root=createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("exposes requirements before submission, links readable documents and keeps password visibility accessible", async () => {
  await act(async () => root.render(<MemoryRouter><RegisterPage /></MemoryRouter>));
  const password = container.querySelector('input[name="password"]');
  expect(password.minLength).toBe(8); expect(password.maxLength).toBe(128);
  expect(container.querySelector(`#${password.getAttribute('aria-describedby')}`).textContent).toContain("8–128");
  expect([...container.querySelectorAll('.legal-checkbox a')].map(link => link.getAttribute('href'))).toEqual(["/documents/user-agreement","/documents/personal-data-policy"]);
  await act(async () => container.querySelector('[aria-label="Показать пароль"]').click());
  expect(password.type).toBe("text");
  expect(container.querySelector('[aria-label="Скрыть пароль"]').getAttribute('aria-pressed')).toBe("true");
  expect(registerUser).not.toHaveBeenCalled();
});
