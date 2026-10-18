import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DurationInput from "./DurationInput";

let root, container, changed;
function Harness({ initial = "" }) {
  const [value, setValue] = useState(initial);
  return <><DurationInput id="duration-hours" name="duration" value={value}
    onValueChange={next => { changed(next); setValue(next); }} /><button>Вне поля</button></>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  changed = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const hours = () => container.querySelector('[aria-label="Часы длительности"]');
const minutes = () => container.querySelector('[aria-label="Минуты длительности"]');
const fill = (input, value) => act(async () => {
  input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
});
const key = (input, name) => act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })));

it("shows empty hour and minute segments and advances after two hour digits", async () => {
  await act(async () => root.render(<Harness />));
  expect(hours().placeholder).toBe("--"); expect(minutes().placeholder).toBe("--");
  await fill(hours(), "10");
  expect(document.activeElement).toBe(minutes());
  await fill(minutes(), "30");
  expect(container.querySelector('[name="duration"]').value).toBe("10:30");
});

it("accepts a single hour digit, a colon, and minutes", async () => {
  await act(async () => root.render(<Harness />));
  await fill(hours(), "1"); await key(hours(), ":");
  expect(document.activeElement).toBe(minutes());
  await fill(minutes(), "30");
  await act(async () => container.querySelector("button").focus());
  expect(container.querySelector('[name="duration"]').value).toBe("01:30");
});

it("keeps durations beyond 24 hours and marks invalid minutes", async () => {
  await act(async () => root.render(<Harness initial="48:00" />));
  expect(hours().value).toBe("48");
  await fill(minutes(), "75");
  expect(minutes().getAttribute("aria-invalid")).toBe("true");
  await act(async () => container.querySelector("button").focus());
  expect(container.querySelector('[name="duration"]').value).toBe("48:75");
});

it("uses arrow keys for adjustment and completes minutes without hours", async () => {
  await act(async () => root.render(<Harness />));
  await fill(minutes(), "30");
  await key(minutes(), "ArrowUp");
  await act(async () => container.querySelector("button").focus());
  expect(container.querySelector('[name="duration"]').value).toBe("00:31");
});

it("accepts a pasted complete duration into either segment", async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "0130" } });
    hours().dispatchEvent(event);
  });
  expect(hours().value).toBe("01"); expect(minutes().value).toBe("30");
});
