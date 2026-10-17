import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SuccessesHistory from "./SuccessesHistory";
import { fetchDailySuccesses, fetchDailySuccessesSummary } from "../../api/dailySuccesses";

vi.mock("../../api/dailySuccesses", () => ({ fetchDailySuccesses: vi.fn(), fetchDailySuccessesSummary: vi.fn() }));
let root, container;
const entry = { id: 3, day: "2026-10-09", text: "Освоил новую тему", category: { id: 7, title: "Учёба", color: "#b5c96b" } };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  fetchDailySuccesses.mockResolvedValue({ items: [entry], has_more: false });
  fetchDailySuccessesSummary.mockResolvedValue({ total: 80, days: 24, categories: [{ category: entry.category, total: 80, days: 24 }] });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = endDate => act(async () => root.render(<MemoryRouter><SuccessesHistory startDate="2026-10-01" endDate={endDate} /></MemoryRouter>));

it("uses the selected period and category and merges paginated records into a single day", async () => {
  fetchDailySuccesses.mockResolvedValueOnce({ items: [entry], has_more: true });
  await render("2026-10-09");
  expect(fetchDailySuccesses).toHaveBeenCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: [] });
  expect(container.querySelector("time").getAttribute("datetime")).toBe("2026-10-09");
  fetchDailySuccesses.mockResolvedValueOnce({ items: [{ ...entry, id: 4, text: "Другой результат" }], has_more: false });
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Показать ещё").click());
  expect(fetchDailySuccesses).toHaveBeenLastCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: [], offset: 1 });
  expect(container.querySelectorAll(".success-journal-entry")).toHaveLength(2);
  expect(container.querySelectorAll("time")).toHaveLength(1);
  expect(container.querySelectorAll(".success-journal-day")).toHaveLength(1);
  fetchDailySuccesses.mockResolvedValueOnce({ items: [], has_more: false });
  await act(async () => container.querySelector('.success-direction').click());
  expect(fetchDailySuccesses).toHaveBeenLastCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: ["7"] });
  expect(container.querySelectorAll(".success-journal-entry")).toHaveLength(0);
});

it("groups multiple dates separately without repeating a date for each record", async () => {
  fetchDailySuccesses.mockResolvedValueOnce({ items: [entry, { ...entry, id: 4, text: "Второй успех" }, { ...entry, id: 5, day: "2026-10-08", text: "Вчерашний успех" }], has_more: false });
  await render("2026-10-09");
  const groups = container.querySelectorAll(".success-journal-day");
  expect(groups).toHaveLength(2);
  expect(groups[0].querySelectorAll("li")).toHaveLength(2);
  expect(groups[1].querySelectorAll("li")).toHaveLength(1);
  expect([...container.querySelectorAll("time")].map(time => time.dateTime)).toEqual(["2026-10-09", "2026-10-08"]);
});

it("keeps the full-period summary when a direction filters the paginated history", async () => {
  await render("2026-10-09");
  expect(fetchDailySuccessesSummary).toHaveBeenCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09" });
  expect(container.querySelector('.successes-summary-heading').textContent).toContain("80 записей · 24 дня");
  const direction = container.querySelector('.success-direction');
  await act(async () => direction.click());
  expect(fetchDailySuccesses).toHaveBeenLastCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: ["7"] });
  expect(direction.getAttribute('aria-pressed')).toBe('true');
  expect(fetchDailySuccessesSummary).toHaveBeenCalledTimes(1);
  await act(async () => direction.click());
  expect(fetchDailySuccesses).toHaveBeenLastCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: [] });
});

it("combines categories including uncategorized and paginates with the same selection", async () => {
  fetchDailySuccessesSummary.mockResolvedValueOnce({ total: 3, days: 1, categories: [
    { category: entry.category, total: 1, days: 1 },
    { category: { id: 8, title: "Работа" }, total: 1, days: 1 },
    { category: null, total: 1, days: 1 },
  ] });
  await render("2026-10-09");
  const buttons = container.querySelectorAll('.success-direction');
  await act(async () => buttons[0].click());
  await act(async () => buttons[1].click());
  fetchDailySuccesses.mockResolvedValueOnce({ items: [entry], has_more: true });
  await act(async () => buttons[2].click());
  expect(fetchDailySuccesses).toHaveBeenLastCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: ["7", "8", "none"] });
  expect([...buttons].map(button => button.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true']);
  fetchDailySuccesses.mockResolvedValueOnce({ items: [{ ...entry, id: 4 }], has_more: false });
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Показать ещё').click());
  expect(fetchDailySuccesses).toHaveBeenLastCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: ["7", "8", "none"], offset: 1 });
  await act(async () => buttons[1].click());
  expect(fetchDailySuccesses).toHaveBeenLastCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: ["7", "none"] });
  await act(async () => buttons[0].click());
  await act(async () => buttons[2].click());
  expect(fetchDailySuccesses).toHaveBeenLastCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: [] });
  expect(fetchDailySuccessesSummary).toHaveBeenCalledTimes(1);
});

it("shows the whole-period distribution and groups smaller categories without hiding their filters", async () => {
  const totals = [40, 25, 15, 10, 5, 2, 2, 1];
  fetchDailySuccessesSummary.mockResolvedValueOnce({ total: 100, days: 30, categories: totals.map((total, index) => ({
    category: { id: index + 7, title: `Категория ${index + 1}` }, total, days: 1,
  })) });
  await render("2026-10-09");
  const chart = container.querySelector('figure[aria-label="Распределение успехов по категориям"]');
  expect(chart.querySelector('.successes-donut-total').textContent).toBe('100записей');
  const legend = chart.querySelectorAll('li');
  expect(legend).toHaveLength(6);
  expect(legend[0].textContent).toContain('40%');
  expect(legend[5].textContent).toBe('Другие категории55%');
  await act(async () => container.querySelector('.successes-directions-toggle').click());
  const categories = container.querySelectorAll('.success-direction');
  expect(categories).toHaveLength(8);
  await act(async () => categories[7].click());
  expect(fetchDailySuccesses).toHaveBeenLastCalledWith({ startDate: "2026-10-01", endDate: "2026-10-09", categoryIds: ["14"] });
  expect(chart.querySelector('.successes-donut-total').textContent).toBe('100записей');
  expect(fetchDailySuccessesSummary).toHaveBeenCalledTimes(1);
});

it("ignores results from a previous period that arrive after the new period", async () => {
  let resolveOld, resolveOldSummary;
  fetchDailySuccesses.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  fetchDailySuccessesSummary.mockReturnValueOnce(new Promise(resolve => { resolveOldSummary = resolve; }));
  await render("2026-10-08");
  await render("2026-10-09");
  expect(container.textContent).toContain(entry.text);
  await act(async () => resolveOld({ items: [{ ...entry, text: "Старый период" }], has_more: true }));
  await act(async () => resolveOldSummary({ total: 999, days: 1, categories: [{ category: entry.category, total: 999, days: 1 }] }));
  expect(container.textContent).not.toContain("Старый период");
  expect(container.querySelector('.successes-summary-heading').textContent).not.toContain("999");
  expect(container.querySelector('.successes-summary-heading').textContent).toContain("80 записей");
  expect(container.textContent).toContain(entry.text);
});

it("keeps the daily history available when the summary request fails", async () => {
  fetchDailySuccessesSummary.mockRejectedValueOnce(new Error("Не удалось загрузить сводку"));
  await render("2026-10-09");
  expect(container.querySelector('.successes-summary [role="alert"]').textContent).toBe("Не удалось загрузить сводку");
  expect(container.querySelector('.success-journal-entry').textContent).toContain(entry.text);
});
