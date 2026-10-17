import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DayPlanFull from "./DayPlanFull";
import { fetchDayTasks, updateDayTask } from "../../../api/tasks";

vi.mock("../../../api/tasks", async importOriginal => ({
  ...await importOriginal(),
  fetchDayTasks:vi.fn(),
  fetchDaySettings:vi.fn().mockResolvedValue({start_time:"06:00"}),
  fetchDayNote:vi.fn().mockResolvedValue({text:""}),
  fetchCategories:vi.fn().mockResolvedValue([]),
  updateDayTask:vi.fn(),
}));
vi.mock("../../goals/DayGoalsPanel", () => ({default:() => null}));
vi.mock("./DailySuccessesPanel", () => ({default:({ day }) => <div data-testid="successes-panel">{day}</div>}));
let root, container;
const task = {id:1,title:"Работа",status:0,duration_min:60,priority:"high",subtasks:[],order_index:0};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); vi.clearAllMocks();
  // jsdom does not implement the native dialog's top-layer methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  container=document.createElement("div"); document.body.append(container); root=createRoot(container);
  fetchDayTasks.mockResolvedValue([task]);
  updateDayTask.mockResolvedValue({...task,status:1});
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  delete HTMLDialogElement.prototype.showModal; delete HTMLDialogElement.prototype.close;
});

it.each([false, true])("offers daily successes in a dialog only when the account opted in: %s", async enabled => {
  await act(async () => root.render(<DayPlanFull selectedDate={new Date(2026,9,9)} user={{ daily_successes_enabled: enabled }} />));
  const trigger = container.querySelector('.day-successes-button');
  expect(Boolean(trigger)).toBe(enabled);
  expect(container.querySelector('[data-testid="successes-panel"]')).toBeNull();
  if (!enabled) return;
  await act(async () => trigger.click());
  const dialog = container.querySelector('dialog');
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector('[data-testid="successes-panel"]').textContent).toBe("2026-10-09");
  expect(container.querySelector('.day-side-panel [data-testid="successes-panel"]')).toBeNull();
  await act(async () => dialog.querySelector('[aria-label="Закрыть успехи"]').click());
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("");
  await act(async () => trigger.click());
  expect(dialog.open).toBe(true);
  await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  expect(dialog.open).toBe(false);
});

it("closes the successes dialog when navigating to another day", async () => {
  const render = date => root.render(<DayPlanFull selectedDate={new Date(2026,9,date)} user={{ daily_successes_enabled: true }} />);
  await act(async () => render(9));
  await act(async () => container.querySelector('.day-successes-button').click());
  await act(async () => render(10));
  expect(container.querySelector('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe("");
  await act(async () => container.querySelector('.day-successes-button').click());
  expect(container.querySelector('[data-testid="successes-panel"]').textContent).toBe("2026-10-10");
});

it("selects tasks by right click, offers select all and restores completion after clearing selection", async () => {
  fetchDayTasks.mockResolvedValue([task, {...task,id:2,title:"Отдых",order_index:1}]);
  await act(async () => root.render(<DayPlanFull selectedDate={new Date(2026,9,3)} />));
  const button = name => [...container.querySelectorAll('button')].find(element => element.textContent === name);
  expect(button("Выбрать задачи")).toBeUndefined();
  expect(button("Выбрать всё")).toBeUndefined();
  await act(async () => button("Список").click());
  await act(async () => container.querySelector('.day-task-item').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  expect(container.textContent).toContain("Выбрано: 1");
  expect(button("Удалить выбранные")).toBeUndefined();
  expect(container.querySelector('.day-task-item').classList.contains('done')).toBe(false);
  expect(updateDayTask).not.toHaveBeenCalled();
  await act(async () => button("Выбрать всё").click());
  expect(container.textContent).toContain("Выбрано: 2");
  expect(container.querySelectorAll('.day-task-item--selected')).toHaveLength(2);
  await act(async () => container.querySelector('[aria-label="Выбрать задачу: Работа"]').click());
  expect(container.textContent).toContain("Выбрано: 1");
  expect(updateDayTask).not.toHaveBeenCalled();
  await act(async () => button("Снять выделение").click());
  expect(button("Выбрать всё")).toBeUndefined();
  const checkbox = container.querySelector('[aria-label="Выполнить задачу: Работа"]');
  expect(checkbox.checked).toBe(false);
  await act(async () => checkbox.click());
  expect(updateDayTask).toHaveBeenCalledWith("2026-10-03",1,expect.objectContaining({status:1}));
  expect(container.querySelector('.day-task-item').classList.contains('done')).toBe(true);
});

it.each(["right click", "checkbox"])("hides selection actions after deselecting the last task by %s", async method => {
  await act(async () => root.render(<DayPlanFull selectedDate={new Date(2026,9,3)} />));
  const listButton = [...container.querySelectorAll('button')].find(element => element.textContent === "Список");
  await act(async () => listButton.click());
  const rightClick = () => container.querySelector('.day-task-item').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
  await act(async () => rightClick());
  expect(container.querySelector('.day-list-selection-actions')).not.toBeNull();
  await act(async () => {
    if (method === "right click") rightClick();
    else container.querySelector('[aria-label="Выбрать задачу: Работа"]').click();
  });
  expect(container.querySelector('.day-list-selection-actions')).toBeNull();
  expect(container.querySelector('[aria-label="Выполнить задачу: Работа"]')).not.toBeNull();
  expect(updateDayTask).not.toHaveBeenCalled();
});
