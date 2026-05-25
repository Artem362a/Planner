import React from "react";
import { Link } from "react-router-dom";
import { fetchGoals } from "../api/goals";
import { fetchOverdueTasks } from "../api/tasks";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  deleteNotification,
} from "../api/notifications";

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

export default function NotificationsBell() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const wrapRef = React.useRef(null);

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
            <div className="notifications-title">Уведомления</div>

            <button
              type="button"
              className="notifications-refresh-btn"
              onClick={loadNotifications}
              disabled={loading}
            >
              {loading ? "..." : "↻"}
            </button>
          </div>

          {loading && items.length === 0 ? (
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