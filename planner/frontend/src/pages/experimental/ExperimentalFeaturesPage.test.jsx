import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ExperimentalFeaturesPage from "./ExperimentalFeaturesPage";
import { setDailySuccessesEnabled } from "../../api/dailySuccesses";

vi.mock("../../api/dailySuccesses", () => ({ setDailySuccessesEnabled: vi.fn() }));
vi.mock("../../api/experimental", () => ({
  fetchMcpStatus: vi.fn().mockResolvedValue({ enabled: false }),
  fetchMcpConnections: vi.fn().mockResolvedValue([]), fetchMcpAudit: vi.fn().mockResolvedValue([]),
  fetchMcpAllowlist: vi.fn(), revokeMcpConnection: vi.fn(), setMcpAllowlistAccess: vi.fn(),
}));
let root, container;
const user = { id: 42, role: "user", daily_successes_enabled: false };
function Harness() {
  const [currentUser, setUser] = useState(user);
  return <MemoryRouter><ExperimentalFeaturesPage user={currentUser} onUserUpdate={setUser} /></MemoryRouter>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("lets an ordinary account enable and disable the feature in the existing settings page", async () => {
  await act(async () => root.render(<Harness />));
  const checkbox = container.querySelector('[aria-label="Успехи за день"]');
  expect(checkbox.checked).toBe(false);
  setDailySuccessesEnabled.mockResolvedValue({ ...user, daily_successes_enabled: true });
  await act(async () => checkbox.click());
  expect(setDailySuccessesEnabled).toHaveBeenCalledWith(true);
  expect(checkbox.checked).toBe(true);
  setDailySuccessesEnabled.mockResolvedValue(user);
  await act(async () => checkbox.click());
  expect(setDailySuccessesEnabled).toHaveBeenLastCalledWith(false);
  expect(checkbox.checked).toBe(false);
});

it("keeps the previous setting and shows an error when saving fails", async () => {
  await act(async () => root.render(<Harness />));
  setDailySuccessesEnabled.mockRejectedValue(new Error("Настройка не сохранена"));
  await act(async () => container.querySelector('[aria-label="Успехи за день"]').click());
  expect(container.querySelector('[aria-label="Успехи за день"]').checked).toBe(false);
  expect(container.querySelector('[role="alert"]').textContent).toBe("Настройка не сохранена");
});
