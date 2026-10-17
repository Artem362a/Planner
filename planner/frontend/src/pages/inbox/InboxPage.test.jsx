import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import InboxPage from "./InboxPage";
import { deleteInboxTask, fetchInboxTasks } from "../../api/inbox";
import { fetchCategories } from "../../api/tasks";

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

it("hides completed tasks until expanded and combines category and text filters", async () => {
  fetchInboxTasks.mockResolvedValue([
    {id:1,title:"Прочесть книгу",category:"study",description:"По математике"},
    {id:2,title:"Купить книгу",category:"home"},
    {id:3,title:"Законченная книга",category:"study",completed_at:"2026-10-03T12:00:00Z"},
  ]);
  fetchCategories.mockResolvedValue([{key:"study",title:"Учёба"},{key:"home",title:"Дом"}]);
  await act(async () => root.render(<MemoryRouter><InboxPage /></MemoryRouter>));
  expect(container.textContent).not.toContain("Законченная книга");
  await act(async () => container.querySelector('.ui-disclosure').click());
  expect(container.textContent).toContain("Законченная книга");
  const category = container.querySelector('.ui-toolbar select');
  await act(async () => { category.value="study"; category.dispatchEvent(new Event("change",{bubbles:true})); });
  const search = container.querySelector('input[type="search"]');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(search,"математике"); search.dispatchEvent(new Event("input",{bubbles:true})); });
  expect(container.textContent).toContain("Прочесть книгу");
  expect(container.textContent).not.toContain("Купить книгу");
  expect(container.textContent).not.toContain("Законченная книга");
});
