import { expect, it } from "vitest";
import { completeDurationInput, formatDurationInput } from "./durationInput";

it.each([
  ["1", "1"], ["10", "10:"], ["100", "10:0"], ["1000", "10:00"],
  ["0130", "01:30"], ["1:30", "1:30"], ["48:00", "48:00"],
  ["abc01:30", "01:30"], ["", ""],
])("formats typed or pasted duration %s as %s", (raw, expected) => {
  expect(formatDurationInput(raw)).toBe(expected);
});

it("allows clearing and deleting across the separator", () => {
  expect(formatDurationInput("10", true)).toBe("10");
  expect(formatDurationInput("1:30", true)).toBe("1:30");
  expect(formatDurationInput(":", true)).toBe("");
});

it.each([["1", "01:00"], ["10:", "10:00"], ["1:3", "01:03"], ["48:00", "48:00"], ["01:70", "01:70"], ["", ""]])(
  "completes partial duration %s on blur without accepting invalid minutes", (raw, expected) => {
    expect(completeDurationInput(raw)).toBe(expected);
  },
);
