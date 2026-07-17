import React from "react";
import { Link } from "react-router-dom";
import {
  createGoal,
  fetchGoalsForDay,
  toggleGoalDayItem,
} from "../../api/goals";

function goalIsDoneForDay(goal) {
  if (goal.goal_type === "recurring") return !!goal.day_done;

  const stages = Array.isArray(goal.stages) ? goal.stages : [];
  const plannedToday = stages.filter((stage) => !!stage.planned_date);

  if (plannedToday.length > 0) {
    return plannedToday.every((stage) => !!stage.done);
  }

  return goal.status === "done";
}

function formatGoalDayMeta(goal, selectedDay) {
  if (goal.goal_type === "recurring") {
    if (goal.repeat_unit === "day") return "каждый день";
    if (goal.repeat_unit === "week") return "еженедельно";
    if (goal.repeat_unit === "month") return "ежемесячно";
    return "регулярно";
  }

  if (goal.target_date === selectedDay) return "дедлайн сегодня";
  return "этап на сегодня";
}

export default function DayGoalsPanel({ selectedDay }) {
  const [goals, setGoals] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [quickTitle, setQuickTitle] = React.useState("");
  const [isQuickOpen, setIsQuickOpen] = React.useState(false);
  // Свёрнутость блока переживает перезагрузку — на мобилках блок съедает
  // много места, и раскрывать его каждый раз заново раздражает.
  const [collapsed, setCollapsed] = React.useState(
    () => localStorage.getItem("dayGoalsCollapsed") === "1"
  );

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem("dayGoalsCollapsed", prev ? "0" : "1");
      return !prev;
    });
  }

  async function loadItems() {
    try {
      setLoading(true);
      const data = await fetchGoalsForDay(selectedDay);
      setGoals(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!selectedDay) return;
    loadItems();
  }, [selectedDay]);

  function replaceGoal(updatedGoal) {
    setGoals((prev) =>
      prev
        .map((goal) => (goal.id === updatedGoal.id ? updatedGoal : goal))
        .filter((goal) => goal.goal_type === "recurring" || goal.status !== "done")
    );
  }

  async function handleToggleGoal(goal) {
    try {
      const updatedGoal = await toggleGoalDayItem({
        goal_id: goal.id,
        stage_id: null,
        day: selectedDay,
      });
      replaceGoal(updatedGoal);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleToggleStage(goal, stage) {
    try {
      const updatedGoal = await toggleGoalDayItem({
        goal_id: goal.id,
        stage_id: stage.id,
        day: selectedDay,
      });
      replaceGoal(updatedGoal);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleQuickCreate(e) {
    e.preventDefault();

    const title = quickTitle.trim();
    if (!title) return;

    try {
      const created = await createGoal({
        title,
        description: null,
        color: "#7ECF8A",
        status: "active",
        goal_type: "one_time",
        target_date: selectedDay,
        repeat_unit: null,
        has_stages: false,
        schedule_mode: null,
      });

      setGoals((prev) => [created, ...prev]);
      setQuickTitle("");
      setIsQuickOpen(false);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <section className="day-side-section day-goals-preview day-goals-panel">
      <div className="day-side-title-row">
        <button
          type="button"
          className="day-goals-collapse-btn"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
        >
          <span
            className={
              "day-goals-chevron" + (collapsed ? "" : " day-goals-chevron--open")
            }
          >
            ▸
          </span>
          <span className="day-goals-collapse-title">Цели</span>
          {collapsed && goals.length > 0 && (
            <span className="day-goals-count">{goals.length}</span>
          )}
        </button>

        <div className="day-goals-header-actions">
          <Link to="/goals" className="day-goals-open-link">
            Управлять
          </Link>
          <button
            type="button"
            className="day-goals-add-btn"
            onClick={() => {
              setCollapsed(false);
              setIsQuickOpen((prev) => !prev);
            }}
            aria-label="Добавить цель на день"
          >
            +
          </button>
        </div>
      </div>

      {!collapsed && isQuickOpen && (
        <form className="day-goals-quick-form" onSubmit={handleQuickCreate}>
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Цель на этот день"
          />
          <button type="submit">Добавить</button>
        </form>
      )}

      {!collapsed && loading && (
        <div className="day-goals-placeholder">Загрузка...</div>
      )}

      {!collapsed && !loading && goals.length === 0 && (
        <div className="day-goals-placeholder">
          На этот день нет целей
        </div>
      )}

      {!collapsed && !loading && goals.length > 0 && (
        <div className="day-goals-list">
          {goals.map((goal) => {
            const stages = Array.isArray(goal.stages) ? goal.stages : [];
            const todayStages = stages.filter(
              (stage) => stage.planned_date === selectedDay
            );
            const shownStages = todayStages.length > 0 ? todayStages : [];
            const doneForDay = goalIsDoneForDay(goal);

            return (
              <article
                key={goal.id}
                className={
                  "day-goals-card" +
                  (doneForDay ? " day-goals-card--done" : "")
                }
                style={{ borderLeftColor: goal.color || "#7ECF8A" }}
              >
                <div className="day-goals-card-main">
                  <label className="day-goals-card-top">
                    <input
                      type="checkbox"
                      checked={doneForDay}
                      onChange={() => handleToggleGoal(goal)}
                      disabled={shownStages.length > 0}
                    />
                    <span>{goal.title}</span>
                  </label>

                  <div className="day-goals-item-meta">
                    {formatGoalDayMeta(goal, selectedDay)}
                  </div>

                  {shownStages.length > 0 && (
                    <div className="day-goals-stage-list">
                      {shownStages.map((stage) => (
                        <label key={stage.id} className="day-goals-stage">
                          <input
                            type="checkbox"
                            checked={!!stage.done}
                            onChange={() => handleToggleStage(goal, stage)}
                          />
                          <span>{stage.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

    </section>
  );
}
