import { describe, expect, it } from "vitest";
import { moveTaskGroup } from "./dayTaskDrag";

const tasks = (ids) => ids.map((id, order_index) => ({ id, order_index }));
const ids = (items) => items.map((item) => item.id);

describe("moveTaskGroup", () => {
  it("moves several tasks as one block and preserves their plan order", () => {
    const result = moveTaskGroup(tasks([1, 2, 3, 4, 5]), [4, 2], 5, "after");

    expect(ids(result)).toEqual([1, 3, 5, 2, 4]);
    expect(result.map((task) => task.order_index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("moves a non-contiguous selection before an earlier task", () => {
    const result = moveTaskGroup(tasks([1, 2, 3, 4, 5]), [3, 5], 1, "before");

    expect(ids(result)).toEqual([3, 5, 1, 2, 4]);
  });

  it("does nothing when hovering over a task inside the moving group", () => {
    const original = tasks([1, 2, 3]);

    expect(moveTaskGroup(original, [1, 3], 3, "before")).toBe(original);
  });

  it("keeps a single task drag compatible with the previous behavior", () => {
    const result = moveTaskGroup(tasks([1, 2, 3]), [1], 3, "after");

    expect(ids(result)).toEqual([2, 3, 1]);
  });
});
