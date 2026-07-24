import { useEffect, useState } from "react";
import {
  carryOverUnfinished,
  dismissOverdueTask,
  fetchCategories,
  fetchDayTasks,
  fetchOverdueTasks,
  rescheduleTask,
} from "../../../api/tasks";

const MONTHS_RU = [
  "января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря",
];

function formatDateShort(dateStr) {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS_RU[m - 1]}`;
}

function addDaysToToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function OverdueCard({ task, onDismiss, onReschedule, hideDate = false, recurring = false }) {
  const [expanded, setExpanded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function doReschedule(newDate) {
    setBusy(true);
    try {
      await onReschedule(task.id, newDate);
    } finally {
      setBusy(false);
    }
  }

  async function doDismiss() {
    setBusy(true);
    try {
      await onDismiss(task.id);
    } finally {
      setBusy(false);
    }
  }

  const dateLabel = task.week_start_date
    ? `${formatDateShort(task.week_start_date)} — ${formatDateShort(task.week_end_date)}`
    : task.day
      ? formatDateShort(task.day)
      : "";

  const borderColor = task.category_color || (
    task.priority === "high" ? "#e74c3c" :
    task.priority === "low"  ? "#27ae60" : "#f39c12"
  );

  return (
    <div
      className={`od-card${busy ? " od-card--busy" : ""}`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="od-card-top">
        <span className="od-card-title">{task.title}</span>
        <div className="od-card-chips">
          {task.category && (
            <span className="od-card-cat">{task.category}</span>
          )}
          {!hideDate && dateLabel && (
            <span className="od-card-date">{dateLabel}</span>
          )}
        </div>
      </div>

      {!expanded ? (
        <div className="od-card-actions">
          {recurring ? (
            <span
              className="od-card-hint"
              title="Задача из плана на неделю — повторяется по расписанию, отдельный перенос не нужен"
            >
              в расписании недели
            </span>
          ) : (
            <button
              className="od-btn od-btn--move"
              onClick={() => setExpanded(true)}
              disabled={busy}
            >
              Перенести
            </button>
          )}
          <button
            className="od-btn od-btn--ignore"
            onClick={doDismiss}
            disabled={busy}
          >
            Игнорировать
          </button>
        </div>
      ) : (
        <div className="od-card-panel">
          <div className="od-quick-row">
            {[
              { label: "+1 день", days: 1 },
              { label: "+2 дня", days: 2 },
              { label: "+3 дня", days: 3 },
            ].map(({ label, days }) => (
              <button
                key={days}
                className="od-chip"
                onClick={() => doReschedule(addDaysToToday(days))}
                disabled={busy}
              >
                {label}
              </button>
            ))}
            <button
              className={`od-chip${showPicker ? " od-chip--active" : ""}`}
              onClick={() => setShowPicker((v) => !v)}
              disabled={busy}
            >
              Дата…
            </button>
          </div>

          {showPicker && (
            <div className="od-picker-row">
              <input
                type="date"
                className="od-date-input"
                min={todayString()}
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
              <button
                className="od-btn od-btn--move"
                onClick={() => customDate && doReschedule(customDate)}
                disabled={!customDate || busy}
              >
                ОК
              </button>
            </div>
          )}

          <button
            className="od-cancel"
            onClick={() => { setExpanded(false); setShowPicker(false); setCustomDate(""); }}
            disabled={busy}
          >
            Отмена
          </button>
        </div>
      )}
    </div>
  );
}

export default function OverdueModal({ onClose }) {
  const [overdue, setOverdue] = useState([]);
  const [todayTasks, setTodayTasks] = useState([]);
  const [catMap, setCatMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [dismissingAll, setDismissingAll] = useState(false);
  const [carrying, setCarrying] = useState(false);

  useEffect(() => {
    const today = todayString();
    Promise.all([
      fetchOverdueTasks().catch(() => []),
      fetchDayTasks(today).catch(() => []),
      fetchCategories().catch(() => []),
    ])
      .then(([overdueData, dayData, catData]) => {
        const map = {};
        (Array.isArray(catData) ? catData : []).forEach((c) => {
          map[c.key] = c;
        });
        setCatMap(map);

        setOverdue(Array.isArray(overdueData) ? overdueData : []);
        const pending = (Array.isArray(dayData) ? dayData : [])
          .filter((t) => Number(t.status) !== 1 && !t.dismissed)
          .map((t) => ({
            id: t.id,
            title: t.title,
            category: t.category,
            category_color: map[t.category]?.color,
            priority: t.priority,
            day: today,
            source_week_task_id: t.source_week_task_id,
            subtasks: t.subtasks || [],
          }));
        setTodayTasks(pending);
      })
      .finally(() => setLoading(false));
  }, []);

  // Показать название категории вместо ключа и подтянуть цвет.
  function withCategory(task) {
    const cat = catMap[task.category];
    return {
      ...task,
      category: cat?.title || task.category,
      category_color: task.category_color || cat?.color,
    };
  }

  // Убираем задачу из обоих списков (в просроченных — с учётом группировки
  // по недельной задаче, в сегодняшних — просто по id).
  function removeTask(taskId) {
    setOverdue((prev) => {
      const target = prev.find((t) => t.id === taskId);
      if (target && target.source_week_task_id) {
        return prev.filter(
          (t) => t.source_week_task_id !== target.source_week_task_id
        );
      }
      return prev.filter((t) => t.id !== taskId);
    });
    setTodayTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  async function handleDismiss(taskId) {
    await dismissOverdueTask(taskId);
    removeTask(taskId);
  }

  async function handleReschedule(taskId, newDate) {
    await rescheduleTask(taskId, newDate);
    removeTask(taskId);
  }

  async function handleDismissAllOverdue() {
    setDismissingAll(true);
    try {
      await Promise.all(overdue.map((t) => dismissOverdueTask(t.id)));
      setOverdue([]);
    } finally {
      setDismissingAll(false);
    }
  }

  async function handleCarryAllToday() {
    setCarrying(true);
    try {
      await carryOverUnfinished(todayString());
      setTodayTasks([]);
    } finally {
      setCarrying(false);
    }
  }

  const total = overdue.length + todayTasks.length;
  const allClear = !loading && total === 0;

  return (
    <div className="task-modal-backdrop" onClick={onClose}>
      <div
        className="overdue-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="od-header">
          <div className="od-header-left">
            <span className="od-header-title">Незакрытые задачи</span>
            {total > 0 && <span className="od-header-badge">{total}</span>}
          </div>
          <div className="od-header-right">
            <button className="od-close" onClick={onClose} aria-label="Закрыть">
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="od-list">
          {loading && <p className="od-empty">Загрузка…</p>}

          {allClear && (
            <div className="od-all-clear">
              <span className="od-all-clear-icon">✓</span>
              <span>Всё разобрано</span>
            </div>
          )}

          {!loading && overdue.length > 0 && (
            <section className="od-section">
              <div className="od-section-head">
                <span className="od-section-title">Просрочено</span>
                <div className="od-section-head-right">
                  <span className="od-section-count">{overdue.length}</span>
                  {overdue.length > 1 && (
                    <button
                      className="od-dismiss-all"
                      onClick={handleDismissAllOverdue}
                      disabled={dismissingAll}
                    >
                      Игнорировать все
                    </button>
                  )}
                </div>
              </div>
              {overdue.map((task) => (
                <OverdueCard
                  key={task.source_week_task_id ?? task.id}
                  task={withCategory(task)}
                  onDismiss={handleDismiss}
                  onReschedule={handleReschedule}
                />
              ))}
            </section>
          )}

          {!loading && todayTasks.length > 0 && (
            <section className="od-section">
              <div className="od-section-head">
                <span className="od-section-title">Сегодня не выполнено</span>
                <div className="od-section-head-right">
                  <span className="od-section-count">{todayTasks.length}</span>
                  {todayTasks.length > 1 && (
                    <button
                      className="od-dismiss-all"
                      onClick={handleCarryAllToday}
                      disabled={carrying}
                    >
                      {carrying ? "Переношу…" : "Все на завтра"}
                    </button>
                  )}
                </div>
              </div>
              {todayTasks.map((task) => (
                <OverdueCard
                  key={task.id}
                  task={withCategory(task)}
                  onDismiss={handleDismiss}
                  onReschedule={handleReschedule}
                  hideDate
                  recurring={!!task.source_week_task_id}
                />
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
