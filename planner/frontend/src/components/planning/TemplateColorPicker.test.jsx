import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TemplateColorPicker from "./TemplateColorPicker";

let container, root, onChange;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onChange = vi.fn();
  await act(async () => root.render(
    <TemplateColorPicker colors={["#7C67D8", "#48B8B0"]} value="#7C67D8" onChange={onChange} />
  ));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("reveals colors on demand, selects a draft color and returns focus to the trigger", async () => {
  const trigger = container.querySelector(".template-color-trigger");
  expect(container.querySelector('[role="group"]')).toBeNull();
  await act(async () => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector('[aria-label="Цвет #7C67D8"]').getAttribute("aria-pressed")).toBe("true");
  await act(async () => container.querySelector('[aria-label="Цвет #48B8B0"]').click());
  expect(onChange).toHaveBeenCalledExactlyOnceWith("#48B8B0");
  expect(container.querySelector('[role="group"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it.each(["Escape", "outside", "trigger"])("dismisses by %s without changing the color", async method => {
  const trigger = container.querySelector(".template-color-trigger");
  await act(async () => trigger.click());
  await act(async () => {
    if (method === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (method === "outside") document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    if (method === "trigger") trigger.click();
  });
  expect(container.querySelector('[role="group"]')).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(onChange).not.toHaveBeenCalled();
});
