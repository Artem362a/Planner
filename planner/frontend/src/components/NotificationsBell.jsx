import React from "react";
import { Link } from "react-router-dom";
import { fetchGoals } from "../api/goals";
import { fetchOverdueTasks } from "../api/tasks";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  deleteNotification,
} from "../api/notifications";
import {
  fetchReminders,
  createReminder,
  deleteReminder,
} from "../api/reminders";

function parseLocalDate(dateStr) {
  const [year, month, day] = String(dateStr || "")
    .split("-")
    .map(Number);

  return new Date(year, (month || 1) - 1, day || 1);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffInDays(fromDate, toDate) {
  const ms = startOfDay(toDate).getTime() - startOfDay(fromDate).getTime();
  return Math.round(ms / 86400000);
}

function buildGoalNotifications(goals) {
  const today = new Date();
  const notifications = [];

  for (const goal of goals) {
    if (!goal || goal.status === "done") continue;

    if (goal.goal_type === "one_time" && goal.target_date) {
      const targetDate = parseLocalDate(goal.target_date);
      const daysLeft = diffInDays(today, targetDate);

      if (daysLeft < 0) {
        notifications.push({
          id: `goal-overdue-${goal.id}`,
          type: "danger",
          source: "goal",
          title: "Цель просрочена",
          text: `Срок цели «${goal.title}» уже прошёл`,
          link: "/goals",
          created_at: goal.target_date,
          is_read: false,
          is_virtual: true,
        });
      } else if (daysLeft === 0) {
        notifications.push({
          id: `goal-today-${goal.id}`,
          type: "warning",
          source: "goal",
          title: "Срок цели сегодня",
          text: `Сегодня дедлайн у цели «${goal.title}»`,
          link: "/goals",
          created_at: goal.target_date,
          is_read: false,
          is_virtual: true,
        });
      } else if (daysLeft === 1) {
        notifications.push({
          id: `goal-tomorrow-${goal.id}`,
          type: "info",
          source: "goal",
          title: "Срок цели завтра",
          text: `Завтра дедлайн у цели «${goal.title}»`,
          link: "/goals",
          created_at: goal.target_date,
          is_read: false,
          is_virtual: true,
        });
      }
    }

    if (goal.goal_type === "recurring") {
      let repeatText = "регулярную цель";
      if (goal.repeat_unit === "daily") repeatText = "ежедневную цель";
      if (goal.repeat_unit === "weekly") repeatText = "еженедельную цель";
      if (goal.repeat_unit === "monthly") repeatText = "ежемесячную цель";

      notifications.push({
        id: `goal-recurring-${goal.id}`,
        type: "info",
        source: "goal",
        title: "Напоминание по цели",
        text: `Не забудь проверить ${repeatText} «${goal.title}»`,
        link: "/goals",
        created_at: new Date().toISOString(),
        is_read: false,
        is_virtual: true,
      });
    }
  }

  return notifications;
}

function normalizeServerNotification(item) {
  return {
    id: item.id,
    type: item.type || "info",
    source: "system",
    title: item.title || "Уведомление",
    text: item.message || "",
    link: item.link || "/",
    created_at: item.created_at,
    is_read: !!item.is_read,
    is_virtual: false,
  };
}

function buildOverdueNotification(tasks) {
  if (!tasks || tasks.length === 0) return null;
  const count = tasks.length;
  const today = new Date().toISOString().slice(0, 10);

  function pluralize(n) {
    if (n >= 11 && n <= 19) return "задач";
    const r = n % 10;
    if (r === 1) return "задача";
    if (r >= 2 && r <= 4) return "задачи";
    return "задач";
  }

  return {
    id: `overdue-tasks-${today}`,
    type: "danger",
    source: "system",
    title: "Просроченные задачи",
    text: `У вас ${count} просроченных ${pluralize(count)}. Откройте план на день, чтобы перенести или игнорировать их.`,
    link: "/day-plan",
    created_at: new Date().toISOString(),
    is_read: false,
    is_virtual: true,
  };
}

function sortNotifications(items) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

const VIRTUAL_READ_STORAGE_KEY = "notifications-virtual-read-ids";
const VIRTUAL_DELETED_STORAGE_KEY = "notifications-virtual-deleted-ids";

function loadVirtualReadIds() {
  try {
    const raw = window.localStorage.getItem(VIRTUAL_READ_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveVirtualReadIds(ids) {
  try {
    window.localStorage.setItem(
      VIRTUAL_READ_STORAGE_KEY,
      JSON.stringify(Array.from(ids))
    );
  } catch {}
}

function loadVirtualDeletedIds() {
  try {
    const raw = window.localStorage.getItem(VIRTUAL_DELETED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveVirtualDeletedIds(ids) {
  try {
    window.localStorage.setItem(
      VIRTUAL_DELETED_STORAGE_KEY,
      JSON.stringify(Array.from(ids))
    );
  } catch {}
}

const RU_WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function formatRemindAt(value) {
  // value: "YYYY-MM-DDTHH:MM"
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${RU_WEEKDAYS[dt.getDay()]} ${dd}.${mm} · ${hh}:${min}`;
}

function todayString() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

export default function NotificationsBell() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [view, setView] = React.useState("notifications"); // notifications | reminders
  const [reminders, setReminders] = React.useState([]);
  const [remindersLoading, setRemindersLoading] = React.useState(false);
  const [reminderText, setReminderText] = React.useState("");
  const [reminderDate, setReminderDate] = React.useState(todayString);
  const [reminderTime, setReminderTime] = React.useState("");
  const [reminderError, setReminderError] = React.useState("");
  const [reminderSaving, setReminderSaving] = React.useState(false);
  const wrapRef = React.useRef(null);

  async function loadReminders() {
    try {
      setRemindersLoading(true);
      const data = await fetchReminders();
      setReminders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setReminders([]);
    } finally {
      setRemindersLoading(false);
    }
  }

  async function handleCreateReminder(e) {
    e.preventDefault();
    const text = reminderText.trim();
    if (!text || !reminderDate || !reminderTime) return;

    const remindAt = `${reminderDate}T${reminderTime}`;
    if (new Date(remindAt).getTime() <= Date.now()) {
      setReminderError("Это время уже прошло");
      return;
    }

    try {
      setReminderSaving(true);
      setReminderError("");
      const created = await createReminder({ text, remind_at: remindAt });
      setReminders((prev) =>
        [...prev, created].sort((a, b) =>
          a.remind_at < b.remind_at ? -1 : 1
        )
      );
      setReminderText("");
      setReminderTime("");
    } catch (error) {
      console.error(error);
      setReminderError("Не удалось создать напоминание");
    } finally {
      setReminderSaving(false);
    }
  }

  function handleDeleteReminder(id) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    deleteReminder(id).catch(() => {});
  }

  async function loadNotifications() {
    try {
      setLoading(true);

      const [goalsData, serverNotificationsData, overdueData] = await Promise.all([
        fetchGoals().catch(() => []),
        fetchMyNotifications().catch(() => []),
        fetchOverdueTasks().catch(() => []),
      ]);

      const goals = Array.isArray(goalsData) ? goalsData : [];
      const serverNotifications = Array.isArray(serverNotificationsData)
        ? serverNotificationsData
        : [];
      const overdueTasks = Array.isArray(overdueData) ? overdueData : [];

      const virtualReadIds = loadVirtualReadIds();
      const virtualDeletedIds = loadVirtualDeletedIds();

      const goalItems = buildGoalNotifications(goals)
        .filter((item) => !virtualDeletedIds.has(item.id))
        .map((item) =>
          virtualReadIds.has(item.id) ? { ...item, is_read: true } : item
        );

      const overdueNotif = buildOverdueNotification(overdueTasks);
      const overdueItems =
        overdueNotif && !virtualDeletedIds.has(overdueNotif.id)
          ? [virtualReadIds.has(overdueNotif.id) ? { ...overdueNotif, is_read: true } : overdueNotif]
          : [];

      // Skip server-side overdue reminders — replaced by the virtual one above
      const backendItems = serverNotifications
        .filter((item) => item.title !== "Просроченные задачи")
        .map(normalizeServerNotification);

      const allItems = [...backendItems, ...goalItems, ...overdueItems];

      setItems(sortNotifications(allItems).slice(0, 20));
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadNotifications();
  }, []);

  React.useEffect(() => {
    if (!open) return;

    const hasUnreadServer = items.some(
      (item) => !item.is_virtual && !item.is_read
    );
    const hasUnreadVirtual = items.some(
      (item) => item.is_virtual && !item.is_read
    );

    if (hasUnreadServer) {
      markAllNotificationsRead().catch(() => {});
    }

    if (hasUnreadVirtual) {
      const stored = loadVirtualReadIds();
      items.forEach((item) => {
        if (item.is_virtual && !item.is_read) stored.add(item.id);
      });
      saveVirtualReadIds(stored);
    }

    if (hasUnreadServer || hasUnreadVirtual) {
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    }
  }, [open]);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function handleNotificationClick() {
    setOpen(false);
  }

  function handleDelete(item, e) {
    e.preventDefault();
    e.stopPropagation();
    setItems((prev) => prev.filter((n) => n.id !== item.id));
    if (item.is_virtual) {
      const deleted = loadVirtualDeletedIds();
      deleted.add(item.id);
      saveVirtualDeletedIds(deleted);
    } else {
      deleteNotification(item.id).catch(() => {});
    }
  }

  const unreadCount = items.filter((item) => !item.is_read).length;

  return (
    <div className="header-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="header-bell-btn"
        aria-label="Уведомления"
        onClick={() => setOpen((prev) => !prev)}
      >
        <img
          src="/bell.svg"
          alt=""
          className="header-bell-icon-img"
          aria-hidden="true"
        />

        {unreadCount > 0 && (
          <span className="header-bell-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notifications-dropdown">
          <div className="notifications-dropdown-head">
            <div className="notifications-title">
              {view === "reminders" ? "Напоминания" : "Уведомления"}
            </div>

            <div className="notifications-head-actions">
              <button
                type="button"
                className={
                  "notifications-refresh-btn" +
                  (view === "reminders" ? " notifications-view-btn--active" : "")
                }
                title={
                  view === "reminders" ? "К уведомлениям" : "Напоминания"
                }
                onClick={() => {
                  const next =
                    view === "reminders" ? "notifications" : "reminders";
                  setView(next);
                  setReminderError("");
                  if (next === "reminders") loadReminders();
                }}
              >
                ⏰
              </button>

              <button
                type="button"
                className="notifications-refresh-btn"
                onClick={view === "reminders" ? loadReminders : loadNotifications}
                disabled={view === "reminders" ? remindersLoading : loading}
              >
                {(view === "reminders" ? remindersLoading : loading)
                  ? "..."
                  : "↻"}
              </button>
            </div>
          </div>

          {view === "reminders" ? (
            <div className="reminders-view">
              <form className="reminder-form" onSubmit={handleCreateReminder}>
                <input
                  type="text"
                  className="reminder-form-text"
                  placeholder="О чём напомнить?"
                  maxLength={200}
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                />
                <div className="reminder-form-row">
                  <input
                    type="date"
                    min={todayString()}
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                  />
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="reminder-form-add"
                    disabled={
                      reminderSaving ||
                      !reminderText.trim() ||
                      !reminderDate ||
                      !reminderTime
                    }
                  >
                    Добавить
                  </button>
                </div>
                {reminderError && (
                  <div className="reminder-form-error">{reminderError}</div>
                )}
              </form>

              {remindersLoading && reminders.length === 0 ? (
                <div className="notifications-empty">Загрузка...</div>
              ) : reminders.length === 0 ? (
                <div className="notifications-empty">
                  Нет запланированных напоминаний
                </div>
              ) : (
                <div className="reminders-list">
                  {reminders.map((r) => (
                    <div key={r.id} className="reminder-item">
                      <div className="reminder-item-body">
                        <div className="reminder-item-when">
                          {formatRemindAt(r.remind_at)}
                        </div>
                        <div className="reminder-item-text">{r.text}</div>
                      </div>
                      <button
                        type="button"
                        className="notification-delete-btn"
                        onClick={() => handleDeleteReminder(r.id)}
                        aria-label="Удалить напоминание"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading && items.length === 0 ? (
            <div className="notifications-empty">Загрузка...</div>
          ) : items.length === 0 ? (
            <div className="notifications-empty">
              Пока нет новых уведомлений
            </div>
          ) : (
            <div className="notifications-list">
              {items.map((item) => (
                <Link
                  key={item.id}
                  to={item.link || "/"}
                  className={`notification-item notification-item--${item.type} ${item.is_read ? "notification-item--read" : ""}`}
                  onClick={() => handleNotificationClick(item)}
                >
                  <div className="notification-item-top">
                    <div className="notification-item-title">{item.title}</div>

                    <div className="notification-item-top-right">
                      {item.source && (
                        <span className="notification-item-source">
                          {item.source === "goal"
                            ? "Цель"
                            : item.source === "system"
                            ? "Система"
                            : item.source}
                        </span>
                      )}
                      <button
                        type="button"
                        className="notification-delete-btn"
                        onClick={(e) => handleDelete(item, e)}
                        aria-label="Удалить уведомление"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="notification-item-text">{item.text}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}