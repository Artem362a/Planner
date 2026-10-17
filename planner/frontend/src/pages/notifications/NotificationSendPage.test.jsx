import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NotificationSendPage from "./NotificationSendPage";
import { fetchUsersForNotifications, sendNotification } from "../../api/notifications";

vi.mock("../../api/notifications", () => ({ fetchUsersForNotifications:vi.fn(), sendNotification:vi.fn() }));
let container, root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true); vi.clearAllMocks();
  container=document.createElement("div"); document.body.append(container); root=createRoot(container);
  fetchUsersForNotifications.mockResolvedValue([{id:1,username:"Лиза",email:"liza@example.com",role:"user"},{id:2,username:"Артём",email:"artem@example.com",role:"user"},{id:3,username:"Админ",role:"developer"}]);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function fill(input,value) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,value); input.dispatchEvent(new Event("input",{bubbles:true})); });
}
it("preserves selected recipients while searching and counts the true all-users audience", async () => {
  await act(async () => root.render(<MemoryRouter><NotificationSendPage /></MemoryRouter>));
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === "Группа").click());
  await act(async () => container.querySelector('.notification-user-item input').click());
  await fill(container.querySelector('input[type="search"]'),"Артём");
  expect(container.querySelectorAll('.notification-user-item')).toHaveLength(1);
  expect(container.querySelector('.notification-preview').textContent).toContain("Получателей: 1");
  expect(container.querySelector('.notification-preview').textContent).toContain("Лиза");
  await fill(container.querySelector('input[type="search"]'),"");
  expect(container.querySelector('.notification-user-item input').checked).toBe(true);
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === "Всем").click());
  expect(container.querySelector('.notification-preview').textContent).toContain("Получателей: 3");
  expect(sendNotification).not.toHaveBeenCalled();
});
