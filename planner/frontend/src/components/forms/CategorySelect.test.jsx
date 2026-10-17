import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CategorySelect from "./CategorySelect";

const categories = {
  study: { id: 7, title: "Учёба", icon: "book", color: "#b5c96b" },
  home: { id: 8, title: "Дом", icon: "home", color: "#88c96b" },
};
let root, container, onChange, onManage, onSubmit;
function Harness({ includeAll = false, dialog = false, empty = false }) {
  const [value, setValue] = useState("");
  const field = <form onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <label>Категория<CategorySelect categories={empty ? {} : categories} value={value} includeAll={includeAll}
      onChange={next => { setValue(next); onChange(next); }} onManageClick={onManage} /></label>
  </form>;
  return dialog ? <dialog open>{field}</dialog> : field;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  onChange = vi.fn(); onManage = vi.fn(); onSubmit = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const trigger = () => container.querySelector('[aria-label="Категория"]');
const choose = title => act(async () => [...document.querySelectorAll('[role="option"]')].find(option => option.textContent === title).click());

it("sends category keys rather than numeric IDs and can clear a task category", async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => trigger().click()); await choose("Учёба");
  expect(onChange).toHaveBeenLastCalledWith("study");
  expect(trigger().textContent).toBe("Учёба");
  await act(async () => trigger().click());
  expect(document.querySelector('[aria-selected="true"]').textContent).toBe("Учёба");
  await choose("Без категории");
  expect(onChange).toHaveBeenLastCalledWith("");
  expect(onSubmit).not.toHaveBeenCalled();
});

it("restores all categories in filters without confusing it with a category key", async () => {
  await act(async () => root.render(<Harness includeAll />));
  expect(trigger().textContent).toBe("Все категории");
  await act(async () => trigger().click()); await choose("Дом");
  expect(onChange).toHaveBeenLastCalledWith("home");
  await act(async () => trigger().click()); await choose("Все категории");
  expect(onChange).toHaveBeenLastCalledWith("");
  expect(trigger().textContent).toBe("Все категории");
});

it("opens category management even with an empty list without submitting or changing the selection", async () => {
  await act(async () => root.render(<Harness empty />));
  await act(async () => trigger().click());
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === "Управление категориями").click());
  expect(onManage).toHaveBeenCalledOnce();
  expect(onChange).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});

it("keeps the popup inside a native dialog and closes only the picker on Escape", async () => {
  await act(async () => root.render(<Harness dialog />));
  await act(async () => trigger().click());
  const dialog = container.querySelector('dialog');
  expect(dialog.querySelector('[role="listbox"]')).not.toBeNull();
  await act(async () => dialog.querySelector('[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(dialog.open).toBe(true);
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
});
