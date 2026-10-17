import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StatisticsPage from "./StatisticsPage";
import { fetchStatistics } from "../../api/statistics";

vi.mock("../../api/statistics", () => ({ fetchStatistics: vi.fn() }));
vi.mock("./SuccessesHistory", () => ({ default: ({ startDate, endDate }) => <section data-testid="successes" data-start={startDate} data-end={endDate}>Дневник успехов</section> }));
let root, container;
const result = { period: { start: "2026-09-10", end: "2026-10-09" }, tasks: { completed: 2, by_day: [], by_category: [] }, goals: {} };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 9, 12));
  fetchStatistics.mockResolvedValue(result);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = enabled => act(async () => root.render(<MemoryRouter><StatisticsPage user={{ daily_successes_enabled: enabled }} /></MemoryRouter>));
const button = title => [...container.querySelectorAll("button")].find(element => element.textContent === title);
const history = () => container.querySelector('[data-testid="successes"]');

it("separates successes from task statistics and keeps period navigation independent", async () => {
  await render(true);
  expect(history()).toBeNull();
  expect(container.textContent).toContain("Задач выполнено");
  await act(async () => button("Успехи").click());
  expect(container.textContent).not.toContain("Задач выполнено");
  expect(history().dataset.start).toBe("2026-09-10");
  await act(async () => button("7 дней").click());
  expect(history().dataset.start).toBe("2026-10-03");
  await act(async () => container.querySelector('[aria-label="Предыдущий период"]').click());
  expect(history().dataset.start).toBe("2026-09-26");
  expect(history().dataset.end).toBe("2026-10-02");
  expect(fetchStatistics).toHaveBeenCalledTimes(1);
  await act(async () => button("Всё время").click());
  expect(history().hasAttribute("data-start")).toBe(false);
  expect(container.querySelector('[aria-label="Предыдущий период"]').disabled).toBe(true);
  await act(async () => button("Задачи и цели").click());
  expect(history()).toBeNull();
  expect(container.textContent).toContain("Задач выполнено");
  expect(fetchStatistics).toHaveBeenCalledTimes(2);
});

it("allows opening successes even when task statistics failed", async () => {
  fetchStatistics.mockRejectedValue(new Error("Не удалось загрузить задачи"));
  await render(true);
  expect(container.textContent).toContain("Не удалось загрузить задачи");
  await act(async () => button("Успехи").click());
  expect(history()).not.toBeNull();
  expect(container.textContent).not.toContain("Не удалось загрузить задачи");
});

it("hides the successes section and navigation when the experiment is disabled", async () => {
  await render(false);
  expect(container.querySelector('[aria-label="Раздел статистики"]')).toBeNull();
  expect(history()).toBeNull();
});
