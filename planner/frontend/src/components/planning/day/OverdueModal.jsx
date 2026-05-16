import { useEffect, useState } from "react";
import {
  dismissOverdueTask,
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

function OverdueCard({ task, onDismiss, onReschedule }) {
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
    : formatDateShort(task.day);

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
          <span className="od-card-date">{dateLabel}</span>
        </div>
      </div>

      {!expanded ? (
        <div className="od-card-actions">
          <button
            className="od-btn od-btn--move"
            onClick={() => setExpanded(true)}
            disabled={busy}
          >
            Перенести
          </button>
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
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissingAll, setDismissingAll] = useState(false);

  useEffect(() => {
    fetchOverdueTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  }, []);

  function removeTask(taskId) {
    setTasks((prev) => {
      const target = prev.find((t) => t.id === taskId);
      if (!target) return prev;
      if (target.source_week_task_id) {
        return prev.filter(
          (t) => t.source_week_task_id !== target.source_week_task_id
        );
      }
      return prev.filter((t) => t.id !== taskId);
    });
  }

  async function handleDismiss(taskId) {
    await dismissOverdueTask(taskId);
    removeTask(taskId);
  }

  async function handleReschedule(taskId, newDate) {
    await rescheduleTask(taskId, newDate);
    removeTask(taskId);
  }

  async function handleDismissAll() {
    setDismissingAll(true);
    try {
      await Promise.all(tasks.map((t) => dismissOverdueTask(t.id)));
      setTasks([]);
    } finally {
      setDismissingAll(false);
    }
  }

  return (
    <div className="task-modal-backdrop" onClick={onClose}>
      <div
        className="overdue-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="od-header">
          <div className="od-header-left">
            <span className="od-header-title">Просроченные задачи</span>
            {tasks.length > 0 && (
              <span className="od-header-badge">{tasks.length}</span>
            )}
          </div>
          <div className="od-header-right">
            {tasks.length > 1 && (
              <button
                className="od-dismiss-all"
                onClick={handleDismissAll}
                disabled={dismissingAll}
              >
                Игнорировать все
              </button>
            )}
            <button className="od-close" onClick={onClose} aria-label="Закрыть">
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="od-list">
          {loading && (
            <p className="od-empty">Загрузка…</p>
          )}
          {!loading && tasks.length === 0 && (
            <div className="od-all-clear">
              <span className="od-all-clear-icon">✓</span>
              <span>Просроченных задач нет</span>
            </div>
          )}
          {!loading && tasks.map((task) => (
            <OverdueCard
              key={task.source_week_task_id ?? task.id}
              task={task}
              onDismiss={handleDismiss}
              onReschedule={handleReschedule}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
