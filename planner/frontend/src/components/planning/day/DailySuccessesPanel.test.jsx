import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DailySuccessesPanel from "./DailySuccessesPanel";
import { deleteDailySuccess, fetchDailySuccesses, saveDailySuccess } from "../../../api/dailySuccesses";
import { createCategory } from "../../../api/tasks";

vi.mock("../../../api/dailySuccesses", () => ({ fetchDailySuccesses: vi.fn(), saveDailySuccess: vi.fn(), deleteDailySuccess: vi.fn() }));
vi.mock("../../../api/tasks", () => ({ createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
let root, container;
const category = { id: 7, title: "Учёба", color: "#b5c96b", icon: "book" };
const entry = { id: 3, day: "2026-10-09", text: "Разобрался с интегралами", category };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  fetchDailySuccesses.mockResolvedValue({ items: [], has_more: false });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(<MemoryRouter><DailySuccessesPanel day="2026-10-09" categories={{ study: category }} /></MemoryRouter>));
const fill = async text => act(async () => {
  const field = container.querySelector("textarea");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, text);
  field.dispatchEvent(new Event("input", { bubbles: true }));
});
const submit = () => act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

it("saves a dated success with an optional category and edits the same entry", async () => {
  await render();
  expect(container.querySelector('a[href="/statistics"]')).toBeNull();
  expect(container.querySelector('[type="submit"]').disabled).toBe(true);
  await fill("  Разобрался с интегралами  ");
  await act(async () => container.querySelector('[aria-label="Категория успеха"]').click());
  await act(async () => [...document.querySelectorAll('[role="option"]')].find(option => option.textContent === "Учёба").click());
  saveDailySuccess.mockResolvedValue(entry);
  await submit();
  expect(saveDailySuccess).toHaveBeenCalledWith({ day: entry.day, text: entry.text, category_id: 7 }, null);
  expect(container.querySelector("textarea").value).toBe("");
  expect(container.querySelectorAll(".success-entry")).toHaveLength(1);
  await act(async () => container.querySelector('[aria-label^="Изменить успех"]').click());
  await fill("Теперь могу решать самостоятельно");
  saveDailySuccess.mockResolvedValue({ ...entry, text: "Теперь могу решать самостоятельно" });
  await submit();
  expect(saveDailySuccess).toHaveBeenLastCalledWith({ day: entry.day, text: "Теперь могу решать самостоятельно", category_id: 7 }, 3);
  expect(container.querySelectorAll(".success-entry")).toHaveLength(1);
  expect(container.textContent).toContain("Теперь могу решать самостоятельно");
});

it("keeps a failed draft, then saves without a category", async () => {
  await render(); await fill("Завершил сложный разговор");
  saveDailySuccess.mockRejectedValueOnce(new Error("Нет связи"));
  await submit();
  expect(container.querySelector('[role="alert"]').textContent).toBe("Нет связи");
  expect(container.querySelector("textarea").value).toBe("Завершил сложный разговор");
  saveDailySuccess.mockResolvedValue({ ...entry, text: "Завершил сложный разговор", category: null });
  await submit();
  expect(saveDailySuccess).toHaveBeenLastCalledWith({ day: entry.day, text: "Завершил сложный разговор", category_id: null }, null);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("requires confirmation and keeps a record when deletion fails", async () => {
  fetchDailySuccesses.mockResolvedValue({ items: [entry], has_more: false }); await render();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const remove = () => act(async () => container.querySelector('[aria-label^="Удалить успех"]').click());
  await remove(); expect(deleteDailySuccess).not.toHaveBeenCalled();
  confirm.mockReturnValue(true); deleteDailySuccess.mockRejectedValueOnce(new Error("Ошибка удаления"));
  await remove(); expect(container.textContent).toContain(entry.text);
  deleteDailySuccess.mockResolvedValue({ ok: true }); await remove();
  expect(container.querySelector(".success-entry")).toBeNull();
});

it("creates and selects a category inside the successes dialog without losing its draft", async () => {
  const created = { id: 8, key: "work", title: "Работа", color: "#9B7BE8", icon: "tag" };
  const refreshed = vi.fn();
  function Harness() {
    const [categories, setCategories] = useState({ study: category });
    return <dialog open><DailySuccessesPanel day="2026-10-09" categories={categories}
      onCategoriesChanged={async () => { refreshed(); setCategories({ study: category, work: created }); }} /></dialog>;
  }
  createCategory.mockResolvedValue(created);
  await act(async () => root.render(<Harness />));
  await fill("Сохрани этот черновик");
  await act(async () => container.querySelector('[aria-label="Категория успеха"]').click());
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === "Управление категориями").click());
  const dialog = container.querySelector('dialog');
  expect(dialog.querySelector('.category-manager-modal')).not.toBeNull();
  expect(document.activeElement.textContent).toBe("Закрыть");
  await act(async () => [...dialog.querySelectorAll('button')].find(button => button.textContent === "+ Новая категория").click());
  await act(async () => {
    const input = dialog.querySelector('input[placeholder="Название"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "Работа");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => [...dialog.querySelectorAll('.category-manager-modal button')].find(button => button.textContent === "Сохранить").click());
  expect(createCategory).toHaveBeenCalledWith(expect.objectContaining({ title: "Работа" }));
  expect(refreshed).toHaveBeenCalledOnce();
  expect(document.activeElement.textContent).toBe("Закрыть");
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(dialog.querySelector('.category-manager-modal')).toBeNull();
  expect(dialog.open).toBe(true);
  expect(container.querySelector('textarea').value).toBe("Сохрани этот черновик");
  await act(async () => container.querySelector('[aria-label="Категория успеха"]').click());
  await act(async () => [...dialog.querySelectorAll('[role="option"]')].find(option => option.textContent === "Работа").click());
  saveDailySuccess.mockResolvedValue({ ...entry, category: created });
  await submit();
  expect(saveDailySuccess).toHaveBeenCalledWith({ day: entry.day, text: "Сохрани этот черновик", category_id: 8 }, null);
});

it("reflects category edits and clears a deleted category before saving an existing success", async () => {
  fetchDailySuccesses.mockResolvedValue({ items: [entry], has_more: false });
  await render();
  await act(async () => container.querySelector('[aria-label^="Изменить успех"]').click());
  await act(async () => root.render(<MemoryRouter><DailySuccessesPanel day={entry.day} categories={{ study: { ...category, title: "Новая учёба" } }} /></MemoryRouter>));
  expect(container.querySelector('.success-category').textContent).toBe("Новая учёба");
  await act(async () => root.render(<MemoryRouter><DailySuccessesPanel day={entry.day} categories={{}} /></MemoryRouter>));
  expect(container.querySelector('[aria-label="Категория успеха"]').textContent).toBe("Без категории");
  saveDailySuccess.mockResolvedValue({ ...entry, category: null });
  await submit();
  expect(saveDailySuccess).toHaveBeenLastCalledWith({ day: entry.day, text: entry.text, category_id: null }, entry.id);
});
