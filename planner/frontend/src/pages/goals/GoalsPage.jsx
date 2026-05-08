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
} from "../../api/goals";
import { fetchCategories } from "../../api/tasks";
import { CategoryIcon } from "../../components/icons";
import CategorySelect from "../../components/forms/CategorySelect";
import CategoryManagerModal from "../../components/categories/CategoryManagerModal";

function getProgress(goal) {
  const stages = Array.isArray(goal.stages) ? goal.stages : [];

  if (stages.length > 0) {
    const doneCount = stages.filter((stage) => !!stage.done).length;
    return doneCount / stages.length;
  }

  return goal.status === "done" ? 1 : 0;
}

function getDoneStagesCount(goal) {
  const stages = Array.isArray(goal.stages) ? goal.stages : [];
  return stages.filter((stage) => !!stage.done).length;
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

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAutoStageDate(index, count, targetDate) {
  if (!targetDate || count <= 0) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(end.getTime()) || end <= today) {
    return targetDate;
  }

  const totalDays = Math.max(
    1,
    Math.round((end.getTime() - today.getTime()) / 86400000)
  );
  const step = totalDays / count;
  const planned = new Date(today);
  planned.setDate(today.getDate() + Math.max(1, Math.round(step * (index + 1))));

  if (planned > end) return targetDate;
  return formatDateInput(planned);
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getStagePlannedDate(stage, index, form) {
  if (!form.has_stages) return null;

  if (form.schedule_mode === "dates") {
    return stage.planned_date || null;
  }

  if (form.goal_type === "one_time" && form.target_date) {
    if (form.schedule_mode === "auto") {
      return getAutoStageDate(index, form.stages.length, form.target_date);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (form.schedule_mode === "every_n_days") {
    const interval = Math.max(1, Number(form.schedule_interval) || 1);
    const planned = new Date(today);
    planned.setDate(today.getDate() + interval * (index + 1));
    return formatDateInput(planned);
  }

  if (form.schedule_mode === "weekly") {
    const planned = new Date(today);
    planned.setDate(today.getDate() + 7 * (index + 1));
    return formatDateInput(planned);
  }

  if (form.schedule_mode === "monthly") {
    return formatDateInput(addMonths(today, index + 1));
  }

  return null;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedGoals, setExpandedGoals] = useState({});
  const [inlineStageInputs, setInlineStageInputs] = useState({});

  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const [createForm, setCreateForm] = useState(createEmptyForm());
  const [newStageTitle, setNewStageTitle] = useState("");

  async function loadGoals() {
    try {
      setLoading(true);
      const data = await fetchGoals();
      const safeGoals = Array.isArray(data) ? data : [];
      setGoals(safeGoals);

      setExpandedGoals((prev) => {
        const next = { ...prev };
        safeGoals.forEach((goal) => {
          if (typeof next[goal.id] === "undefined") {
            next[goal.id] = false;
          }
        });
        return next;
      });
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
    setCreateForm(createEmptyForm());
    setNewStageTitle("");
    setShowAdvancedCreate(false);
    setIsCreateOpen(true);
  }

  function closeCreateModal() {
    setIsCreateOpen(false);
  }

  function toggleGoalExpanded(goalId) {
    setExpandedGoals((prev) => ({
      ...prev,
      [goalId]: !prev[goalId],
    }));
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
      target_date: prev.target_date || "",
      repeat_unit: goalType === "recurring" ? prev.repeat_unit || "day" : "day",
    }));
  }

  function addStageToCreateForm() {
    const title = newStageTitle.trim();
    if (!title) return;

    setCreateForm((prev) => ({
      ...prev,
      stages: [
        ...prev.stages,
        {
          id: `${Date.now()}-${Math.random()}`,
          title,
          done: false,
          planned_date: "",
        },
      ],
    }));

    setNewStageTitle("");
  }

  function removeStageFromCreateForm(stageId) {
    setCreateForm((prev) => ({
      ...prev,
      stages: prev.stages.filter((stage) => stage.id !== stageId),
    }));
  }

  function updateStageInCreateForm(stageId, patch) {
    setCreateForm((prev) => ({
      ...prev,
      stages: prev.stages.map((stage) =>
        stage.id === stageId ? { ...stage, ...patch } : stage
      ),
    }));
  }

  async function handleCreateGoal(e) {
    e.preventDefault();

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

    try {
      const createdGoal = await createGoal({
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
      });

      let actualGoal = createdGoal;

      if (createForm.has_stages && createForm.stages.length > 0) {
        for (const stage of createForm.stages) {
          actualGoal = await createGoalStage(createdGoal.id, {
            title: stage.title,
            done: false,
            planned_date: getStagePlannedDate(
              stage,
              createForm.stages.indexOf(stage),
              createForm
            ),
          });
        }
      }

      setGoals((prev) => [actualGoal, ...prev]);
      setExpandedGoals((prev) => ({
        ...prev,
        [actualGoal.id]: true,
      }));

      closeCreateModal();
    } catch (error) {
      console.error(error);
      alert(error.message || "Не удалось создать цель");
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

  async function addInlineStage(goal) {
    const value = (inlineStageInputs[goal.id] || "").trim();
    if (!value) return;

    try {
      const updatedGoal = await createGoalStage(goal.id, {
        title: value,
        done: false,
        planned_date: null,
      });

      setGoals((prev) =>
        prev.map((item) => (item.id === goal.id ? updatedGoal : item))
      );

      setInlineStageInputs((prev) => ({
        ...prev,
        [goal.id]: "",
      }));

      setExpandedGoals((prev) => ({
        ...prev,
        [goal.id]: true,
      }));
    } catch (error) {
      console.error(error);
    }
  }

  async function removeStage(goal, stageId) {
    try {
      const updatedGoal = await deleteGoalStage(goal.id, stageId);

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
                <div className="goals-page-head-left">
                  <span className="feedback-badge">Цели</span>
                  <h2 className="goals-page-title">Твои цели</h2>
                  <p className="goals-page-subtitle">
                    Простые, регулярные и цели с этапами — всё в одном месте
                  </p>
                </div>

                <button
                  type="button"
                  className="week-add-btn goals-create-btn"
                  onClick={openCreateModal}
                >
                  + Новая цель
                </button>
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
                    const doneStagesCount = getDoneStagesCount(goal);
                    const isExpanded = !!expandedGoals[goal.id];

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
                            <div
                              className="goal-card-main"
                              onClick={() => toggleGoalExpanded(goal.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) =>
                                e.key === "Enter" && toggleGoalExpanded(goal.id)
                              }
                            >
                              <div className="goal-card-title-row">
                                <div className="goal-card-title-block">
                                  <div className="goal-card-title">
                                    {goal.category_key && categoriesMap[goal.category_key] ? (
                                      <span
                                        className="goal-card-cat-icon"
                                        style={{ color: goal.color }}
                                      >
                                        <CategoryIcon
                                          name={categoriesMap[goal.category_key].icon}
                                        />
                                      </span>
                                    ) : (
                                      <span className="goal-expand-icon">
                                        {isExpanded ? "▾" : "▸"}
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

                                    {stages.length > 0 && (
                                      <span className="goal-meta-chip goal-meta-chip--light">
                                        {doneStagesCount}/{stages.length}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {goal.description && isExpanded && (
                                <div className="goal-card-description">
                                  {goal.description}
                                </div>
                              )}

                              <div className="goal-progress-row">
                                <div className="goal-progress-track">
                                  <div
                                    className="goal-progress-fill"
                                    style={{
                                      width: `${percent}%`,
                                      backgroundColor:
                                        goal.color || "#7ECF8A",
                                    }}
                                  />
                                </div>

                                <div className="goal-progress-percent">
                                  {percent}%
                                </div>
                              </div>
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
                                className="goal-action-btn goal-action-btn--danger"
                                title="Удалить цель"
                                onClick={() => handleDeleteGoal(goal.id)}
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="goal-stages-wrap goal-stages-wrap--soft">
                              <div className="goal-stages-title">Этапы</div>

                              {stages.length > 0 ? (
                                <ul className="subtasks-list">
                                  {stages.map((stage) => (
                                    <li key={stage.id} className="subtask-item">
                                      <label>
                                        <input
                                          type="checkbox"
                                          checked={!!stage.done}
                                          onChange={() =>
                                            toggleStage(goal, stage)
                                          }
                                        />
                                        <span>
                                          {stage.title}
                                          {stage.planned_date && (
                                            <em className="goal-stage-date">
                                              {stage.planned_date}
                                            </em>
                                          )}
                                        </span>
                                      </label>

                                      <button
                                        type="button"
                                        className="subtask-remove-btn"
                                        onClick={() =>
                                          removeStage(goal, stage.id)
                                        }
                                      >
                                        ×
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="goal-empty-stages">
                                  Добавь этапы, чтобы двигаться к цели по шагам
                                </div>
                              )}

                              <div className="subtask-inline-add-row">
                                <input
                                  type="text"
                                  placeholder="Новый этап"
                                  value={inlineStageInputs[goal.id] || ""}
                                  onChange={(e) =>
                                    setInlineStageInputs((prev) => ({
                                      ...prev,
                                      [goal.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addInlineStage(goal);
                                    }
                                  }}
                                />

                                <button
                                  type="button"
                                  onClick={() => addInlineStage(goal)}
                                >
                                  +
                                </button>
                              </div>
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
                  className="modal goal-create-modal goal-create-modal--soft"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="goal-create-modal-header">
                    <div>
                      <h3>Новая цель</h3>
                      <p>
                        Сначала заполни только главное. Остальное — по желанию.
                      </p>
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
                    <div className="goal-type-switch">
                      <button
                        type="button"
                        className={
                          "goal-type-chip" +
                          (createForm.goal_type === "one_time"
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
                          (createForm.has_stages
                            ? " goal-type-chip--active"
                            : "")
                        }
                        onClick={() => {
                          setGoalType("one_time");
                          setShowAdvancedCreate(true);
                          setCreateForm((prev) => ({
                            ...prev,
                            goal_type: "one_time",
                            has_stages: true,
                            schedule_mode: prev.schedule_mode || "auto",
                          }));
                        }}
                      >
                        С этапами
                      </button>
                    </div>

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

                      {(createForm.goal_type === "one_time" ||
                        createForm.goal_type === "recurring") && (
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
                      )}

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

                    <button
                      type="button"
                      className="goal-advanced-toggle"
                      onClick={() => setShowAdvancedCreate((prev) => !prev)}
                    >
                      {showAdvancedCreate
                        ? "Скрыть расширенные настройки"
                        : "Показать расширенные настройки"}
                    </button>

                    {showAdvancedCreate && (
                      <div className="goal-advanced-block">
                        <label className="goal-form-field goal-form-field--full">
                          <span>Описание</span>
                          <input
                            type="text"
                            name="description"
                            value={createForm.description}
                            onChange={handleCreateFormChange}
                            placeholder="Коротко о цели"
                          />
                        </label>

                        <label className="goal-checkbox-row">
                          <input
                            type="checkbox"
                            name="has_stages"
                            checked={createForm.has_stages}
                            onChange={handleCreateFormChange}
                          />
                          <span>Разбить цель на этапы</span>
                        </label>

                        {createForm.has_stages && (
                          <div className="subtasks-form-block subtasks-form-block--soft">
                            <label className="goal-form-field goal-form-field--full">
                              <span>Способ планирования этапов</span>
                              <select
                                name="schedule_mode"
                                value={createForm.schedule_mode}
                                onChange={handleCreateFormChange}
                              >
                                <option value="auto">
                                  Автоматическое распределение
                                </option>
                                <option value="every_n_days">
                                  Раз в N дней
                                </option>
                                <option value="weekly">
                                  По неделям
                                </option>
                                <option value="monthly">
                                  По месяцам
                                </option>
                                <option value="dates">
                                  По конкретным датам
                                </option>
                              </select>
                            </label>

                            {createForm.schedule_mode === "every_n_days" && (
                              <label className="goal-form-field goal-form-field--full">
                                <span>Интервал в днях</span>
                                <input
                                  type="number"
                                  min="1"
                                  name="schedule_interval"
                                  value={createForm.schedule_interval}
                                  onChange={handleCreateFormChange}
                                />
                              </label>
                            )}

                            {createForm.schedule_mode === "auto" &&
                              createForm.goal_type === "one_time" &&
                              createForm.target_date &&
                              createForm.stages.length > 0 && (
                                <div className="goal-auto-plan-note">
                                  Этапы будут равномерно распределены до{" "}
                                  {createForm.target_date}
                                </div>
                              )}

                            <div className="subtasks-form-title">Этапы</div>

                            <div className="subtasks-form-input-row">
                              <input
                                type="text"
                                placeholder="Добавить этап"
                                value={newStageTitle}
                                onChange={(e) =>
                                  setNewStageTitle(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addStageToCreateForm();
                                  }
                                }}
                              />

                              <button
                                type="button"
                                onClick={addStageToCreateForm}
                              >
                                +
                              </button>
                            </div>

                            {createForm.stages.length > 0 && (
                              <ul className="subtasks-form-list">
                                {createForm.stages.map((stage, index) => (
                                  <li key={stage.id}>
                                    <div className="goal-stage-draft">
                                      <span className="subtasks-form-text">
                                        {stage.title}
                                      </span>

                                      {createForm.schedule_mode !== "dates" &&
                                        getStagePlannedDate(
                                          stage,
                                          index,
                                          createForm
                                        ) && (
                                          <em>
                                            {getStagePlannedDate(
                                              stage,
                                              index,
                                              createForm
                                            )}
                                          </em>
                                        )}

                                      {createForm.schedule_mode === "dates" && (
                                        <input
                                          type="date"
                                          value={stage.planned_date || ""}
                                          onChange={(e) =>
                                            updateStageInCreateForm(stage.id, {
                                              planned_date: e.target.value,
                                            })
                                          }
                                        />
                                      )}
                                    </div>

                                    <button
                                      type="button"
                                      className="subtasks-form-remove"
                                      onClick={() =>
                                        removeStageFromCreateForm(stage.id)
                                      }
                                    >
                                      ×
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="modal-buttons">
                      <button type="submit" className="week-add-btn">
                        Добавить цель
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
