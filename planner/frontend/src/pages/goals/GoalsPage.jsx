import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  createGoalStage,
  updateGoalStage,
  deleteGoalStage,
  toggleGoalFocus,
} from "../../api/goals";
import { fetchCategories } from "../../api/tasks";
import { CategoryIcon } from "../../components/icons";
import CategorySelect from "../../components/forms/CategorySelect";
import CategoryManagerModal from "../../components/categories/CategoryManagerModal";
import GoalStagesEditor from "../../components/goals/GoalStagesEditor";
import GoalStagesStrip, {
  summarizeStages,
} from "../../components/goals/GoalStagesStrip";

function FocusIcon({ active }) {
  // Мишень/прицел — «взять в фокус». В активном состоянии центр залит.
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill={active ? "currentColor" : "none"}
      />
      <line x1="12" y1="1.5" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22.5" y2="12" />
    </svg>
  );
}

function getProgress(goal) {
  const stages = Array.isArray(goal.stages) ? goal.stages : [];

  if (stages.length > 0) {
    const doneCount = stages.filter((stage) => !!stage.done).length;
    return doneCount / stages.length;
  }

  return goal.status === "done" ? 1 : 0;
}

function getVisibleGoals(goals, filter) {
  if (filter === "done") {
    return goals.filter((goal) => goal.status === "done");
  }

  if (filter === "active") {
    return goals.filter((goal) => goal.status !== "done");
  }

  return goals;
}

function formatGoalMeta(goal) {
  if (goal.goal_type === "recurring") {
    let repeatText = "Регулярная цель";
    if (goal.repeat_unit === "day") repeatText = "Каждый день";
    if (goal.repeat_unit === "week") repeatText = "Каждую неделю";
    if (goal.repeat_unit === "month") repeatText = "Каждый месяц";
    return goal.target_date ? `${repeatText} до ${goal.target_date}` : repeatText;
  }

  if (goal.target_date) {
    return `До ${goal.target_date}`;
  }

  return "Разовая цель";
}

function createEmptyForm() {
  return {
    title: "",
    description: "",
    color: "#7ECF8A",
    category_key: null,
    goal_type: "one_time",
    target_date: "",
    repeat_unit: "day",
    has_stages: false,
    schedule_mode: "auto",
    schedule_interval: 7,
    stages: [],
  };
}

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);

  const [categories, setCategories] = useState([]);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const [createForm, setCreateForm] = useState(createEmptyForm());
  // Защита от двойного сабмита при медленной сети (дубликаты целей).
  const [goalSaving, setGoalSaving] = useState(false);

  const isEditing = editingGoalId !== null;

  async function loadGoals() {
    try {
      setLoading(true);
      const data = await fetchGoals();
      const safeGoals = Array.isArray(data) ? data : [];
      setGoals(safeGoals);
    } catch (error) {
      console.error(error);
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGoals();
    fetchCategories()
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const visibleGoals = useMemo(() => {
    return getVisibleGoals(goals, filter);
  }, [goals, filter]);

  const categoriesMap = useMemo(() => {
    return Object.fromEntries(categories.map((c) => [c.key, c]));
  }, [categories]);

  const emptyGoalsText = useMemo(() => {
    if (goals.length === 0) {
      return "Пока нет целей. Добавь первую цель";
    }

    if (filter === "active") {
      return "Все цели завершены";
    }

    if (filter === "done") {
      return "Завершённых целей пока нет";
    }

    return "Пока нет целей";
  }, [filter, goals.length]);

  function openCreateModal() {
    setEditingGoalId(null);
    setCreateForm(createEmptyForm());
    setIsCreateOpen(true);
  }

  function openEditModal(goal) {
    setEditingGoalId(goal.id);
    setCreateForm({
      title: goal.title || "",
      description: goal.description || "",
      color: goal.color || "#7ECF8A",
      category_key: goal.category_key || null,
      goal_type: goal.goal_type || "one_time",
      target_date: goal.target_date || "",
      repeat_unit: goal.repeat_unit || "day",
      has_stages: !!goal.has_stages,
      schedule_mode: goal.schedule_mode || "auto",
      schedule_interval: 7,
      stages: (Array.isArray(goal.stages) ? goal.stages : []).map((s) => ({ ...s, _isNew: false })),
    });
    setIsCreateOpen(true);
  }

  function closeCreateModal() {
    setIsCreateOpen(false);
    setEditingGoalId(null);
  }

  function handleCreateFormChange(e) {
    const { name, value, type, checked } = e.target;

    setCreateForm((prev) => {
      const nextValue = type === "checkbox" ? checked : value;
      const next = {
        ...prev,
        [name]: nextValue,
      };

      if (name === "goal_type") {
        if (value === "one_time") {
          next.target_date = prev.target_date || "";
          next.repeat_unit = "day";
        }

        if (value === "recurring") {
          next.target_date = prev.target_date || "";
          next.repeat_unit = prev.repeat_unit || "day";
        }
      }

      if (name === "has_stages" && !checked) {
        next.schedule_mode = "auto";
        next.schedule_interval = 7;
        next.stages = [];
      }

      return next;
    });
  }

  function setGoalType(goalType) {
    setCreateForm((prev) => ({
      ...prev,
      goal_type: goalType,
      has_stages: false,
      target_date: prev.target_date || "",
      repeat_unit: goalType === "recurring" ? prev.repeat_unit || "day" : "day",
    }));
  }

  async function handleCreateGoal(e) {
    e.preventDefault();
    if (goalSaving) return;

    const title = createForm.title.trim();
    if (!title) {
      alert("Введите название цели");
      return;
    }

    if (createForm.goal_type === "one_time" && !createForm.target_date) {
      alert("Укажи срок для разовой цели");
      return;
    }

    if (createForm.goal_type === "recurring" && !createForm.repeat_unit) {
      alert("Укажи периодичность регулярной цели");
      return;
    }

    if (createForm.goal_type === "recurring" && !createForm.target_date) {
      alert("Укажи дату, до которой повторять цель");
      return;
    }

    const payload = {
      title,
      description: createForm.description.trim() || null,
      color: createForm.color,
      category_key: createForm.category_key || null,
      status: "active",
      goal_type: createForm.goal_type,
      target_date: createForm.target_date || null,
      repeat_unit:
        createForm.goal_type === "recurring" ? createForm.repeat_unit : null,
      has_stages: createForm.has_stages,
      schedule_mode: createForm.has_stages ? createForm.schedule_mode : null,
    };

    try {
      setGoalSaving(true);
      if (isEditing) {
        const existing = goals.find((g) => g.id === editingGoalId);
        await updateGoal(editingGoalId, {
          ...payload,
          status: existing?.status || "active",
        });

        if (createForm.has_stages) {
          const originalIds = new Set((existing?.stages || []).map((s) => s.id));
          const keptIds = new Set(
            createForm.stages.filter((s) => !s._isNew).map((s) => s.id)
          );

          for (const origId of originalIds) {
            if (!keptIds.has(origId)) {
              await deleteGoalStage(editingGoalId, origId).catch(console.error);
            }
          }

          // Индекс в массиве = визуальный порядок (в т.ч. после
          // перетаскивания) — сохраняем его в order_index каждого этапа.
          for (let index = 0; index < createForm.stages.length; index += 1) {
            const stage = createForm.stages[index];
            if (stage._isNew) {
              await createGoalStage(editingGoalId, {
                title: stage.title,
                done: stage.done || false,
                planned_date: stage.planned_date || null,
                order_index: index,
              }).catch(console.error);
            } else {
              await updateGoalStage(editingGoalId, stage.id, {
                title: stage.title,
                done: stage.done || false,
                planned_date: stage.planned_date || null,
                order_index: index,
              }).catch(console.error);
            }
          }
        }

        await loadGoals();
        closeCreateModal();
        return;
      }

      const createdGoal = await createGoal(payload);
      let actualGoal = createdGoal;

      if (createForm.has_stages && createForm.stages.length > 0) {
        for (let index = 0; index < createForm.stages.length; index += 1) {
          const stage = createForm.stages[index];
          actualGoal = await createGoalStage(createdGoal.id, {
            title: stage.title,
            done: stage.done || false,
            planned_date: stage.planned_date || null,
            order_index: index,
          });
        }
      }

      setGoals((prev) => [actualGoal, ...prev]);
      closeCreateModal();
    } catch (error) {
      console.error(error);
      alert(error.message || (isEditing ? "Не удалось сохранить цель" : "Не удалось создать цель"));
    } finally {
      setGoalSaving(false);
    }
  }

  async function handleDeleteGoal(goalId) {
    const ok = window.confirm("Удалить цель?");
    if (!ok) return;

    try {
      await deleteGoal(goalId);
      setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
    } catch (error) {
      console.error(error);
    }
  }

  async function toggleStage(goal, stage) {
    try {
      const updatedGoal = await updateGoalStage(goal.id, stage.id, {
        title: stage.title,
        done: !stage.done,
        planned_date: stage.planned_date || null,
      });

      setGoals((prev) =>
        prev.map((item) => (item.id === goal.id ? updatedGoal : item))
      );
    } catch (error) {
      console.error(error);
    }
  }

  async function toggleGoalDone(goal) {
    try {
      const nextStatus = goal.status === "done" ? "active" : "done";

      const updatedGoal = await updateGoal(goal.id, {
        title: goal.title,
        description: goal.description,
        color: goal.color,
        status: nextStatus,
        goal_type: goal.goal_type || "one_time",
        target_date: goal.target_date || null,
        repeat_unit: goal.repeat_unit || null,
        has_stages: !!goal.has_stages,
        schedule_mode: goal.schedule_mode || null,
      });

      setGoals((prev) =>
        prev.map((item) => (item.id === goal.id ? updatedGoal : item))
      );
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="app-wrapper">
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <Link to="/" className="feedback-back-link">
              ← Назад
            </Link>
          </div>

          <div className="app-header-center">ЦЕЛИ</div>

          <div className="app-header-right" />
        </header>

        <main className="day-page-main">
          <div className="day-big-card goals-shell-card">
            <section className="goals-page-section">
              <div className="goals-page-head">
                <h2 className="goals-page-title">Твои цели</h2>
              </div>

              <div className="goals-toolbar goals-toolbar--clean">
                <div className="goals-filter-row">
                  <button
                    type="button"
                    className={
                      "goal-filter-btn" +
                      (filter === "active" ? " goal-filter-btn--active" : "")
                    }
                    onClick={() => setFilter("active")}
                  >
                    Активные
                  </button>

                  <button
                    type="button"
                    className={
                      "goal-filter-btn" +
                      (filter === "done" ? " goal-filter-btn--active" : "")
                    }
                    onClick={() => setFilter("done")}
                  >
                    Завершённые
                  </button>

                  <button
                    type="button"
                    className={
                      "goal-filter-btn" +
                      (filter === "all" ? " goal-filter-btn--active" : "")
                    }
                    onClick={() => setFilter("all")}
                  >
                    Все
                  </button>
                </div>
              </div>

              {loading && <div className="day-task-empty">Загрузка...</div>}

              {!loading && visibleGoals.length === 0 && (
                <div className="day-task-empty goals-empty-state">
                  {emptyGoalsText}
                </div>
              )}

              {!loading && visibleGoals.length > 0 && (
                <div className="goals-list goals-list--clean">
                  {visibleGoals.map((goal) => {
                    const stages = Array.isArray(goal.stages) ? goal.stages : [];
                    const progress = getProgress(goal);
                    const percent = Math.round(progress * 100);

                    return (
                      <article
                        key={goal.id}
                        className={
                          "goal-card goal-card--soft" +
                          (goal.status === "done" ? " goal-card--done" : "")
                        }
                      >
                        <div
                          className="goal-card-accent"
                          style={{ backgroundColor: goal.color || "#7ECF8A" }}
                        />

                        <div className="goal-card-content">
                          <div className="goal-card-top">
                            <div className="goal-card-main">
                              <div className="goal-card-title-row">
                                <div className="goal-card-title-block">
                                  <div className="goal-card-title">
                                    {goal.category_key && categoriesMap[goal.category_key] && (
                                      <span
                                        className="goal-card-cat-icon"
                                        style={{ color: goal.color }}
                                      >
                                        <CategoryIcon
                                          name={categoriesMap[goal.category_key].icon}
                                        />
                                      </span>
                                    )}
                                    {goal.title}
                                  </div>

                                  <div className="goal-card-meta-inline">
                                    <span className="goal-meta-chip">
                                      {formatGoalMeta(goal)}
                                    </span>

                                    <span className="goal-meta-chip goal-meta-chip--light">
                                      {goal.status === "done"
                                        ? "Завершена"
                                        : "В процессе"}
                                    </span>

                                    {stages.length > 0 && (() => {
                                      const sum = summarizeStages(stages);
                                      return (
                                        <>
                                          <span className="goal-meta-chip goal-meta-chip--light">
                                            {sum.done}/{sum.total}
                                          </span>
                                          {sum.overdueCount > 0 && (
                                            <span className="goal-meta-chip goal-meta-chip--overdue">
                                              просрочено {sum.overdueCount}
                                            </span>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>

                              {goal.description && (
                                <div className="goal-card-description">
                                  {goal.description}
                                </div>
                              )}

                              {/* Прогресс-бар только для целей без этапов —
                                  у целей с этапами прогресс показывает лента. */}
                              {stages.length === 0 && (
                                <div className="goal-progress-row">
                                  <div className="goal-progress-track">
                                    <div
                                      className="goal-progress-fill"
                                      style={{
                                        width: `${percent}%`,
                                        backgroundColor: goal.color || "#7ECF8A",
                                      }}
                                    />
                                  </div>

                                  <div className="goal-progress-percent">
                                    {percent}%
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="goal-card-actions goal-card-actions--clean">
                              <button
                                type="button"
                                className="goal-action-btn goal-action-btn--success"
                                title={
                                  goal.status === "done"
                                    ? "Вернуть в активные"
                                    : "Отметить завершённой"
                                }
                                onClick={() => toggleGoalDone(goal)}
                              >
                                {goal.status === "done" ? "↺" : "✓"}
                              </button>

                              <button
                                type="button"
                                className={
                                  "goal-action-btn goal-action-btn--focus" +
                                  (goal.is_focus ? " is-active" : "")
                                }
                                title={goal.is_focus ? "Убрать из фокуса" : "В фокус"}
                                onClick={async () => {
                                  const updated = await toggleGoalFocus(goal.id);
                                  setGoals((prev) =>
                                    prev.map((g) => (g.id === updated.id ? updated : g))
                                  );
                                }}
                              >
                                <FocusIcon active={!!goal.is_focus} />
                              </button>

                              <button
                                type="button"
                                className="goal-action-btn goal-action-btn--danger"
                                title="Удалить цель"
                                onClick={() => handleDeleteGoal(goal.id)}
                              >
                                ×
                              </button>

                              <button
                                type="button"
                                className="goal-action-btn"
                                title="Редактировать цель"
                                onClick={() => openEditModal(goal)}
                              >
                                ✎
                              </button>
                            </div>
                          </div>

                          {stages.length > 0 && (
                            <div className="goal-stages-plain">
                              <GoalStagesStrip
                                stages={stages}
                                color={goal.color}
                                onToggle={(stage) => toggleStage(goal, stage)}
                              />
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                className="fab-button goals-fab-mobile"
                onClick={openCreateModal}
                aria-label="Добавить цель"
              >
                +
              </button>
            </section>

            {isCreateOpen && (
              <div className="modal-overlay" onClick={closeCreateModal}>
                <div
                  className={
                    "modal goal-create-modal goal-create-modal--soft" +
                    (createForm.has_stages ? " goal-create-modal--expanded" : "")
                  }
                  style={createForm.has_stages
                    ? { width: "min(880px, calc(100vw - 24px))", maxWidth: "880px" }
                    : undefined
                  }
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="goal-create-modal-header">
                    <div>
                      <h3>{isEditing ? "Редактировать цель" : "Новая цель"}</h3>
                    </div>

                    <button
                      type="button"
                      className="goal-modal-close"
                      onClick={closeCreateModal}
                    >
                      ×
                    </button>
                  </div>

                  <form onSubmit={handleCreateGoal} className="task-modal-form">
                    {/* 3 mutually exclusive types */}
                    <div className="goal-type-switch">
                      <button
                        type="button"
                        className={
                          "goal-type-chip" +
                          (createForm.goal_type === "one_time" && !createForm.has_stages
                            ? " goal-type-chip--active"
                            : "")
                        }
                        onClick={() => setGoalType("one_time")}
                      >
                        Разовая
                      </button>

                      <button
                        type="button"
                        className={
                          "goal-type-chip" +
                          (createForm.goal_type === "recurring"
                            ? " goal-type-chip--active"
                            : "")
                        }
                        onClick={() => setGoalType("recurring")}
                      >
                        Регулярная
                      </button>

                      <button
                        type="button"
                        className={
                          "goal-type-chip" +
                          (createForm.has_stages ? " goal-type-chip--active" : "")
                        }
                        onClick={() =>
                          setCreateForm((prev) => ({
                            ...prev,
                            goal_type: "one_time",
                            has_stages: true,
                            schedule_mode: prev.schedule_mode || "auto",
                          }))
                        }
                      >
                        С этапами
                      </button>
                    </div>

                    {/* Two-column on desktop when С этапами, single column otherwise */}
                    <div className={createForm.has_stages ? "goal-form-cols" : ""}>

                      {/* Main / left column */}
                      <div className={createForm.has_stages ? "goal-form-col-main" : ""}>
                        <div className="goal-form-grid">
                          <label className="goal-form-field goal-form-field--full">
                            <span>Название цели</span>
                            <input
                              type="text"
                              name="title"
                              value={createForm.title}
                              onChange={handleCreateFormChange}
                              placeholder="Например, Сделать систему целей"
                            />
                          </label>

                          {categories.length > 0 && (
                            <label className="goal-form-field goal-form-field--full goal-form-field--cat">
                              <span>Категория</span>
                              <CategorySelect
                                value={createForm.category_key || ""}
                                categories={categoriesMap}
                                placeholder="Без категории"
                                dropUp
                                onChange={(key) => {
                                  const cat = categoriesMap[key];
                                  setCreateForm((prev) => ({
                                    ...prev,
                                    category_key: key || null,
                                    color: cat ? cat.color : "#7ECF8A",
                                  }));
                                }}
                                onManageClick={() => setIsCategoryManagerOpen(true)}
                              />
                            </label>
                          )}

                          <label className="goal-form-field goal-form-field--full">
                            <span>
                              {createForm.goal_type === "recurring"
                                ? "Повторять до"
                                : "Срок достижения"}
                            </span>
                            <input
                              type="date"
                              name="target_date"
                              value={createForm.target_date}
                              onChange={handleCreateFormChange}
                            />
                          </label>

                          {createForm.goal_type === "recurring" && (
                            <label className="goal-form-field goal-form-field--full">
                              <span>Частота</span>
                              <select
                                name="repeat_unit"
                                value={createForm.repeat_unit}
                                onChange={handleCreateFormChange}
                              >
                                <option value="day">Каждый день</option>
                                <option value="week">Каждую неделю</option>
                                <option value="month">Каждый месяц</option>
                              </select>
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Right column: unified stages editor (same UI for create & edit) */}
                      {createForm.has_stages && (
                        <div className="goal-form-col-aside">
                          <div className="subtasks-form-block subtasks-form-block--soft">
                            <div className="subtasks-form-title">Этапы</div>
                            <GoalStagesEditor
                              stages={createForm.stages}
                              targetDate={createForm.target_date}
                              onChange={(nextStages) =>
                                setCreateForm((prev) => ({ ...prev, stages: nextStages }))
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="modal-buttons">
                      <button
                        type="submit"
                        className="week-add-btn"
                        disabled={goalSaving}
                      >
                        {goalSaving
                          ? "Сохраняю…"
                          : isEditing
                          ? "Сохранить"
                          : "Добавить цель"}
                      </button>

                      <button
                        type="button"
                        className="modal-cancel-btn"
                        onClick={closeCreateModal}
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {isCategoryManagerOpen && (
        <CategoryManagerModal
          categories={categoriesMap}
          onClose={() => setIsCategoryManagerOpen(false)}
          onCategoriesChanged={() =>
            fetchCategories()
              .then((data) => setCategories(Array.isArray(data) ? data : []))
              .catch(() => {})
          }
        />
      )}
    </div>
  );
}
