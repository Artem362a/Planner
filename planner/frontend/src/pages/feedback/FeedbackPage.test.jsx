import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FeedbackPage from "./FeedbackPage";
import { fetchMyFeedbackList, submitFeedback } from "../../api/feedback";

vi.mock("../../api/feedback", () => ({ fetchMyFeedbackList:vi.fn(), submitFeedback:vi.fn() }));
let container,root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); vi.clearAllMocks();
  container=document.createElement("div"); document.body.append(container); root=createRoot(container);
  fetchMyFeedbackList.mockResolvedValue(Array.from({length:25},(_,index) => ({id:index+1,status:index === 24 ? "resolved" : "new",category:"Интерфейс",type:"Баг",message:`Сообщение ${index+1}`,developer_reply:index === 24 ? "Готово" : ""})));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("prefills contact details and finds developer replies beyond the initial history page", async () => {
  await act(async () => root.render(<MemoryRouter><FeedbackPage user={{username:"Лиза",email:"liza@example.com"}} /></MemoryRouter>));
  expect(container.querySelector('input[name="name"]').value).toBe("Лиза");
  expect(container.querySelector('input[name="contact"]').value).toBe("liza@example.com");
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === "Мои обращения").click());
  expect(container.querySelectorAll('article')).toHaveLength(20);
  const input=container.querySelector('input[type="search"]');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input," ГОТОВО "); input.dispatchEvent(new Event("input",{bubbles:true})); });
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).toContain("Сообщение 25");
  const select=container.querySelector('.ui-toolbar select');
  await act(async () => { select.value="active"; select.dispatchEvent(new Event("change",{bubbles:true})); });
  expect(container.querySelectorAll('article')).toHaveLength(0);
  expect(container.textContent).toContain("По этим условиям обращений нет");
  expect(submitFeedback).not.toHaveBeenCalled();
});
