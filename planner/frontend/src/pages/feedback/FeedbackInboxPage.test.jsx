import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FeedbackInboxPage from "./FeedbackInboxPage";
import { fetchFeedbackList, updateFeedbackStatus, replyToFeedback } from "../../api/feedback";

vi.mock("../../api/feedback", () => ({ fetchFeedbackList:vi.fn(), updateFeedbackStatus:vi.fn(), replyToFeedback:vi.fn() }));
let container, root;
const items = [1,2].map(id => ({id,status:"new",category:"Входящие",type:"Баг",name:`Автор ${id}`,message:`Сообщение ${id}`,created_at:`2026-10-03T14:2${id}:00`,developer_reply:""}));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); vi.clearAllMocks();
  container=document.createElement("div"); document.body.append(container); root=createRoot(container);
  fetchFeedbackList.mockResolvedValue(items);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("keeps only failed bulk updates selected and retries them without sending replies", async () => {
  updateFeedbackStatus.mockImplementation((id,status) => id === 1 ? Promise.resolve({...items[0],status}) : Promise.reject(new Error("Нет связи")));
  await act(async () => root.render(<MemoryRouter><FeedbackInboxPage /></MemoryRouter>));
  await act(async () => container.querySelector('[aria-label="Выбрать показанные обращения"]').click());
  const resolveButton = [...container.querySelectorAll('.admin-bulk-toolbar button')].find(button => button.textContent === "Решено");
  await act(async () => resolveButton.click());
  expect(updateFeedbackStatus).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[aria-label="Выбрать обращение #1"]')).toBeNull();
  expect(container.querySelector('[aria-label="Выбрать обращение #2"]').checked).toBe(true);
  expect(container.querySelector('[role="alert"]').textContent).toContain("Не удалось обновить 1");
  updateFeedbackStatus.mockResolvedValue({...items[1],status:"resolved"});
  await act(async () => resolveButton.click());
  expect(updateFeedbackStatus).toHaveBeenCalledTimes(3);
  expect(updateFeedbackStatus).toHaveBeenLastCalledWith(2,"resolved");
  expect(container.textContent).toContain("По этим условиям обращений нет");
  expect(replyToFeedback).not.toHaveBeenCalled();
});

it("does not select records beyond the visible page", async () => {
  fetchFeedbackList.mockResolvedValue(Array.from({length:25},(_,index) => ({...items[0],id:index+1})));
  await act(async () => root.render(<MemoryRouter><FeedbackInboxPage /></MemoryRouter>));
  expect(container.querySelectorAll('article')).toHaveLength(20);
  await act(async () => container.querySelector('[aria-label="Выбрать показанные обращения"]').click());
  expect(container.textContent).toContain("Выбрано: 20");
  expect(container.querySelectorAll('article input:checked')).toHaveLength(20);
  expect(updateFeedbackStatus).not.toHaveBeenCalled();
});

it("shows bulk actions only while records are selected", async () => {
  await act(async () => root.render(<MemoryRouter><FeedbackInboxPage /></MemoryRouter>));
  expect(container.querySelector('.admin-bulk-toolbar')).toBeNull();
  const checkbox = container.querySelector('[aria-label="Выбрать обращение #1"]');
  await act(async () => checkbox.click());
  expect(container.querySelector('.admin-bulk-toolbar').textContent).toContain("Выбрано: 1");
  expect(container.querySelector('article.is-selected')).not.toBeNull();
  await act(async () => checkbox.click());
  expect(container.querySelector('.admin-bulk-toolbar')).toBeNull();
  await act(async () => container.querySelector('[aria-label="Выбрать показанные обращения"]').click());
  const clear = [...container.querySelectorAll('.admin-bulk-toolbar button')].find(button => button.textContent === "Снять выделение");
  await act(async () => clear.click());
  expect(container.querySelector('.admin-bulk-toolbar')).toBeNull();
  expect(container.querySelectorAll('article input:checked')).toHaveLength(0);
  expect(updateFeedbackStatus).not.toHaveBeenCalled();
  expect(replyToFeedback).not.toHaveBeenCalled();
});
