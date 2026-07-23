import React from "react";
import { Link } from "react-router-dom";
import {
  createGoal,
  fetchGoals,
  fetchGoalsForDay,
  toggleGoalDayItem,
} from "../../api/goals";

function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// Ближайшие активные цели для «пустого» дня: у каждой считаем ближайшую веху
// (следующий невыполненный этап / дедлайн), сортируем по дате, берём топ-3.
function computeUpcomingGoals(allGoals) {
  const items = [];

  for (const goal of allGoals) {
    if (goal.status !== "active") continue;

    const stages = Array.isArray(goal.stages) ? goal.stages : [];
    let sortDate = null;
    let meta = "";
    let progress = "";

    if (goal.goal_type === "recurring") {
      meta = "регулярная цель";
    } else if (stages.length > 0) {
      const doneCount = stages.filter((s) => s.done).length;
      progress = `${doneCount}/${stages.length}`;
      const nextStage = stages.find((s) => !s.done);
      if (nextStage) {
        sortDate = nextStage.planned_date || null;
        meta = nextStage.planned_date
          ? `дальше: ${nextStage.title} · ${formatShortDate(nextStage.planned_date)}`
          : `дальше: ${nextStage.title}`;
      } else {
        sortDate = goal.target_date || null;
        meta = goal.target_date
          ? `дедлайн ${formatShortDate(goal.target_date)}`
          : "этапы выполнены";
      }
    } else {
      sortDate = goal.target_date || null;
      meta = goal.target_date
        ? `дедлайн ${formatShortDate(goal.target_date)}`
        : "без срока";
    }

    items.push({ goal, sortDate, meta, progress });
  }

  // sortDate — ISO-строка YYYY-MM-DD, лексикографическое сравнение = по дате.
  items.sort((a, b) => {
    if (a.sortDate && b.sortDate) return a.sortDate.localeCompare(b.sortDate);
    if (a.sortDate) return -1;
    if (b.sortDate) return 1;
    return 0;
  });

  return items.slice(0, 3);
}

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
  const [upcomingGoals, setUpcomingGoals] = React.useState([]);
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
      const list = Array.isArray(data) ? data : [];
      setGoals(list);
      // На сегодня по целям делать нечего — вместо пустоты подтянем ближайшие
      // активные цели, чтобы блок не выглядел так, будто целей нет вообще.
      if (list.length === 0) {
        const all = await fetchGoals();
        setUpcomingGoals(computeUpcomingGoals(Array.isArray(all) ? all : []));
      } else {
        setUpcomingGoals([]);
      }
    } catch (error) {
      console.error(error);
      setGoals([]);
      setUpcomingGoals([]);
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
        upcomingGoals.length > 0 ? (
          <div className="day-goals-upcoming">
            <div className="day-goals-upcoming-label">Скоро</div>
            {upcomingGoals.map((u) => (
              <Link
                to="/goals"
                key={u.goal.id}
                className="day-goals-upcoming-item"
              >
                <span
                  className="day-goals-upcoming-accent"
                  style={{ backgroundColor: u.goal.color || "#7ECF8A" }}
                />
                <div className="day-goals-upcoming-content">
                  <div className="day-goals-upcoming-title">
                    <span>{u.goal.title}</span>
                    {u.progress && (
                      <span className="day-goals-upcoming-progress">
                        {u.progress}
                      </span>
                    )}
                  </div>
                  {u.meta && (
                    <div className="day-goals-upcoming-meta">{u.meta}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="day-goals-placeholder">Целей пока нет</div>
        )
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
                  {shownStages.length > 0 ? (
                    // У цели есть этап(ы) на сегодня — «закрыть всю цель» галочкой
                    // тут смысла нет, поэтому заголовок цели идёт текстом, а
                    // живые галочки — только у самих этапов ниже.
                    <div className="day-goals-card-top day-goals-card-top--heading">
                      <span>{goal.title}</span>
                    </div>
                  ) : (
                    <label className="day-goals-card-top">
                      <input
                        type="checkbox"
                        checked={doneForDay}
                        onChange={() => handleToggleGoal(goal)}
                      />
                      <span>{goal.title}</span>
                    </label>
                  )}

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
