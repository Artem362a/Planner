import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchInboxTasks,
  createInboxTask,
  updateInboxTask,
  deleteInboxTask,
  assignInboxToDay,
  assignInboxToWeek,
} from "../../api/inbox";
import { fetchCategories } from "../../api/tasks";
import CategorySelect from "../../components/forms/CategorySelect";
import CategoryManagerModal from "../../components/categories/CategoryManagerModal";
import PrioritySelect from "../../components/forms/PrioritySelect";

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalDate(d);
}

function formatWeekLabel(mondayStr) {
  const [y, m, day] = mondayStr.split("-").map(Number);
  const mon = new Date(y, m - 1, day);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d) =>
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${fmt(mon)} — ${fmt(sun)}`;
}

function parseUtc(isoStr) {
  if (!isoStr) return null;
  const s = isoStr.endsWith("Z") || isoStr.includes("+") ? isoStr : isoStr + "Z";
  return new Date(s);
}

function formatCreatedAt(isoStr) {
  const d = parseUtc(isoStr);
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PRIORITY_LABELS = { high: "Важно", medium: "Обычный", low: "Низкий" };
const PRIORITY_COLORS = { high: "#e74c3c", medium: "#7b5ecf", low: "#27ae60" };

const EMPTY_FORM = { title: "", description: "", priority: "medium", category: "" };

export default function InboxPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState({});

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [expandedDesc, setExpandedDesc] = useState(new Set());

  function toggleDesc(id) {
    setExpandedDesc((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const [assignDay, setAssignDay] = useState(null);
  const [assignDayDate, setAssignDayDate] = useState(formatLocalDate(new Date()));

  const [assignWeek, setAssignWeek] = useState(null);
  const [assignWeekDate, setAssignWeekDate] = useState(formatLocalDate(new Date()));

  async function loadCategories() {
    try {
      const items = await fetchCategories();
      const map = {};
      for (const c of (items || [])) map[c.key] = c;
      setCategories(map);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    Promise.all([fetchInboxTasks(), fetchCategories()])
      .then(([inboxData, catData]) => {
        setTasks(Array.isArray(inboxData) ? inboxData : []);
        const map = {};
        for (const c of (catData || [])) map[c.key] = c;
        setCategories(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingTask(null);
    setForm({ ...EMPTY_FORM, category: Object.keys(categories)[0] || "" });
    setIsFormOpen(true);
  }

  function openEdit(task) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      category: task.category || "",
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingTask(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        category: form.category || null,
        subtasks: [],
      };
      if (editingTask) {
        const updated = await updateInboxTask(editingTask.id, payload);
        setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? updated : t)));
      } else {
        const created = await createInboxTask(payload);
        setTasks((prev) => [created, ...prev]);
      }
      closeForm();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(taskId) {
    await deleteInboxTask(taskId).catch(console.error);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  async function handleAssignDay() {
    if (!assignDay || !assignDayDate) return;
    try {
      await assignInboxToDay(assignDay.id, assignDayDate);
      const stampedAt = new Date().toISOString();
      setTasks((prev) =>
        prev.map((t) => (t.id === assignDay.id ? { ...t, assigned_at: stampedAt } : t))
      );
    } catch (err) {
      console.error(err);
    }
    setAssignDay(null);
  }

  async function handleAssignWeek() {
    if (!assignWeek || !assignWeekDate) return;
    const monday = getMonday(assignWeekDate);
    try {
      await assignInboxToWeek(assignWeek.id, monday);
      const stampedAt = new Date().toISOString();
      setTasks((prev) =>
        prev.map((t) => (t.id === assignWeek.id ? { ...t, assigned_at: stampedAt } : t))
      );
    } catch (err) {
      console.error(err);
    }
    setAssignWeek(null);
  }

  const weekLabel = assignWeekDate ? formatWeekLabel(getMonday(assignWeekDate)) : "";

  return (
    <div className="app-wrapper">
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <Link to="/" className="back-link">←</Link>
          </div>
          <div className="app-header-center">ВХОДЯЩИЕ</div>
          <div className="app-header-right" />
        </header>

        <main className="day-page-main">
          <div className="day-big-card">
            <section className="day-tasks-page">
              <div className="page-tasks-wrapper">
                {loading ? (
                  <div className="inbox-empty">Загрузка…</div>
                ) : tasks.length === 0 ? (
                  <div className="inbox-empty">
                    <div className="inbox-empty-title">Входящие пусты</div>
                    <div className="inbox-empty-hint">
                      Записывай задачи сюда, чтобы не забыть — потом назначишь на день или неделю
                    </div>
                  </div>
                ) : (() => {
                  const activeTasks = tasks.filter(t => !t.completed_at);
                  const doneTasks = tasks.filter(t => !!t.completed_at);

                  const renderTask = (task, showAssignBtns) => {
                    const catColor = categories[task.category]?.color;
                    const priColor = PRIORITY_COLORS[task.priority] || "#7b5ecf";
                    const tintColor = catColor || priColor;
                    const isAssigned = !!task.assigned_at;
                    const isCompleted = !!task.completed_at;

                    return (
                      <li
                        key={task.id}
                        className={
                          "day-task-item" +
                          (isCompleted ? " day-task-item--inbox-done" : isAssigned ? " day-task-item--assigned" : "")
                        }
                        style={{ "--task-list-tint": `${tintColor}22` }}
                      >
                        <div className="day-task-content">
                          <div className="day-task-title">{task.title}</div>

                          <div className="day-task-meta">
                            {isCompleted && (
                              <span
                                className="tag"
                                style={{ background: "#27ae6022", color: "#27ae60" }}
                                title="Задача выполнена"
                              >
                                ✓ Выполнено
                              </span>
                            )}
                            {!isCompleted && isAssigned && (
                              <span
                                className="tag"
                                style={{ background: "#7b5ecf22", color: "#7b5ecf" }}
                                title="Задача добавлена в план"
                              >
                                В плане
                              </span>
                            )}

                            {task.category && categories[task.category] && (
                              <span
                                className="tag"
                                style={{ background: `${catColor}22`, color: catColor }}
                              >
                                {categories[task.category].title}
                              </span>
                            )}

                            {task.priority !== "medium" && (
                              <span
                                className="tag"
                                style={{ background: `${priColor}18`, color: priColor }}
                              >
                                {PRIORITY_LABELS[task.priority]}
                              </span>
                            )}

                            <span className="inbox-task-date">
                              {formatCreatedAt(task.created_at)}
                            </span>

                            {task.description && (
                              <button
                                className="inbox-desc-toggle"
                                onClick={() => toggleDesc(task.id)}
                              >
                                описание {expandedDesc.has(task.id) ? "▲" : "▼"}
                              </button>
                            )}

                            {showAssignBtns && (
                              <>
                                <button
                                  className="inbox-assign-btn inbox-assign-btn--day"
                                  onClick={() => {
                                    setAssignDay(task);
                                    setAssignDayDate(formatLocalDate(new Date()));
                                  }}
                                >
                                  В день
                                </button>
                                <button
                                  className="inbox-assign-btn inbox-assign-btn--week"
                                  onClick={() => {
                                    setAssignWeek(task);
                                    setAssignWeekDate(formatLocalDate(new Date()));
                                  }}
                                >
                                  В неделю
                                </button>
                              </>
                            )}
                          </div>

                          {task.description && expandedDesc.has(task.id) && (
                            <div className="inbox-task-desc">{task.description}</div>
                          )}
                        </div>

                        <div
                          className="day-task-color"
                          style={{ backgroundColor: tintColor }}
                        />

                        <div className="day-task-actions">
                          <button
                            className="day-task-delete"
                            onClick={() => handleDelete(task.id)}
                            title="Удалить"
                          >
                            ×
                          </button>
                          <button
                            className="day-task-edit"
                            onClick={() => openEdit(task)}
                            title="Редактировать"
                          >
                            ✎
                          </button>
                        </div>
                      </li>
                    );
                  };

                  return (
                    <>
                      {activeTasks.length > 0 && (
                        <ul className="day-tasks-list">
                          {activeTasks.map(t => renderTask(t, true))}
                        </ul>
                      )}
                      {doneTasks.length > 0 && (
                        <>
                          <div className="inbox-section-divider">
                            <span>Выполнено · {doneTasks.length}</span>
                          </div>
                          <ul className="day-tasks-list">
                            {doneTasks.map(t => renderTask(t, false))}
                          </ul>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </section>

            <button className="fab-button" onClick={openCreate} title="Добавить во входящие">
              +
            </button>
          </div>
        </main>
      </div>

      {/* Create / Edit modal */}
      {isFormOpen && (
        <div className="task-modal-backdrop">
          <div className="task-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingTask ? "Редактировать задачу" : "Новая задача"}</h3>

            <form onSubmit={handleSubmit} className="task-modal-form">
              <label>
                Название
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Что нужно сделать?"
                  autoFocus
                />
              </label>

              <label>
                Описание
                <textarea
                  className="inbox-textarea"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Подробности (необязательно)"
                  rows={3}
                />
              </label>

              <label>
                Приоритет
                <PrioritySelect
                  value={form.priority}
                  onChange={(val) => setForm((p) => ({ ...p, priority: val }))}
                />
              </label>

              <label>
                Категория
                <CategorySelect
                  value={form.category}
                  categories={categories}
                  onChange={(key) => setForm((p) => ({ ...p, category: key }))}
                  onManageClick={() => setIsCategoryManagerOpen(true)}
                  placeholder="Без категории"
                  dropUp={true}
                />
              </label>

              <div className="modal-buttons">
                <button type="submit" className="week-add-btn" disabled={submitting}>
                  {editingTask ? "Сохранить" : "Добавить"}
                </button>
                <button type="button" className="modal-cancel-btn" onClick={closeForm}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign to Day modal */}
      {assignDay && (
        <div className="task-modal-backdrop" onClick={() => setAssignDay(null)}>
          <div className="task-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Назначить на день</h3>
            <p className="inbox-modal-task-name">«{assignDay.title}»</p>

            <div className="task-modal-form">
              <label>
                Дата
                <input
                  type="date"
                  value={assignDayDate}
                  onChange={(e) => setAssignDayDate(e.target.value)}
                />
              </label>
            </div>

            <div className="modal-buttons">
              <button className="week-add-btn" onClick={handleAssignDay}>
                Назначить
              </button>
              <button className="modal-cancel-btn" onClick={() => setAssignDay(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Week modal */}
      {assignWeek && (
        <div className="task-modal-backdrop" onClick={() => setAssignWeek(null)}>
          <div className="task-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Назначить на неделю</h3>
            <p className="inbox-modal-task-name">«{assignWeek.title}»</p>

            <div className="task-modal-form">
              <label>
                Любой день нужной недели
                <input
                  type="date"
                  value={assignWeekDate}
                  onChange={(e) => setAssignWeekDate(e.target.value)}
                />
              </label>
              {assignWeekDate && (
                <div className="inbox-week-label">{weekLabel}</div>
              )}
            </div>

            <div className="modal-buttons">
              <button className="week-add-btn" onClick={handleAssignWeek}>
                Назначить
              </button>
              <button className="modal-cancel-btn" onClick={() => setAssignWeek(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {isCategoryManagerOpen && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setIsCategoryManagerOpen(false)}
          onCategoriesChanged={loadCategories}
        />
      )}
    </div>
  );
}
