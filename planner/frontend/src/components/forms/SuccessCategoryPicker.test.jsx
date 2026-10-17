import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SuccessCategoryPicker from "./SuccessCategoryPicker";

const categories = [{ id: 7, title: "Учёба", icon: "book", color: "#b5c96b" }, { id: 8, title: "Работа", icon: "briefcase", color: "#88c96b" }];
let root, container, onChange;
function Harness({ includeAll = false, disabled = false }) {
  const [value, setValue] = useState("");
  return <SuccessCategoryPicker label="Категория успеха" categories={categories} value={value} includeAll={includeAll} disabled={disabled} onChange={next => { setValue(next); onChange(next); }} />;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container); onChange = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const trigger = () => container.querySelector('[aria-label="Категория успеха"]');
const input = () => document.querySelector('[role="combobox"]');
const key = name => act(async () => input().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })));

it("filters categories and selects with the keyboard without submitting the surrounding form", async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => trigger().click());
  expect(document.activeElement).toBe(input());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input(), "работ");
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect([...document.querySelectorAll('[role="option"]')].map(option => option.textContent)).toEqual(["Работа"]);
  await key("Enter");
  expect(onChange).toHaveBeenCalledWith("8");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
  expect(trigger().textContent).toBe("Работа");
});

it("supports arrow navigation, clearing the category, Escape and outside dismissal", async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => trigger().click());
  await key("ArrowDown"); await key("Enter");
  expect(onChange).toHaveBeenLastCalledWith("7");
  await act(async () => trigger().click());
  await key("ArrowUp"); await key("Enter");
  expect(onChange).toHaveBeenLastCalledWith("");
  await act(async () => trigger().click()); await key("Escape");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger());
  await act(async () => trigger().click());
  await act(async () => document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});

it("keeps all categories and uncategorized distinct in the history filter and cannot open when disabled", async () => {
  await act(async () => root.render(<Harness includeAll />));
  expect(trigger().textContent).toBe("Все категории");
  await act(async () => trigger().click()); await key("ArrowDown"); await key("Enter");
  expect(onChange).toHaveBeenLastCalledWith("none");
  await act(async () => root.render(<Harness includeAll disabled />));
  expect(trigger().disabled).toBe(true);
  await act(async () => trigger().click());
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
