import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import InboxPage from "./InboxPage";
import { deleteInboxTask, fetchInboxTasks } from "../../api/inbox";

vi.mock("../../api/inbox", () => ({
  fetchInboxTasks: vi.fn(),
  deleteInboxTask: vi.fn(),
  createInboxTask: vi.fn(),
  updateInboxTask: vi.fn(),
  assignInboxToDay: vi.fn(),
  assignInboxToWeek: vi.fn(),
}));
vi.mock("../../api/tasks", () => ({ fetchCategories: vi.fn().mockResolvedValue([]) }));
vi.mock("../../components/categories/CategoryManagerModal", () => ({ default: () => null }));

let container;
let root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchInboxTasks.mockResolvedValue([
    { id: 42, title: "Не потерять задачу", priority: "medium", created_at: "2026-09-07T10:00:00Z" },
  ]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("keeps the task on deletion failure and removes it after a successful retry", async () => {
  deleteInboxTask.mockRejectedValueOnce(new Error("Ошибка удаления"));
  deleteInboxTask.mockResolvedValueOnce({ ok: true });
  await act(async () => root.render(<MemoryRouter><InboxPage /></MemoryRouter>));
  expect(container.textContent).toContain("Не потерять задачу");

  await act(async () => container.querySelector('button[title="Удалить"]').click());
  expect(deleteInboxTask).toHaveBeenCalledWith(42);
  expect(container.textContent).toContain("Не потерять задачу");
  expect(container.querySelector('[role="alert"]').textContent).toBe("Ошибка удаления");

  await act(async () => container.querySelector('button[title="Удалить"]').click());
  expect(deleteInboxTask).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain("Не потерять задачу");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
