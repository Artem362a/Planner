import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchGoals } from "../../api/goals";

function getGoalProgress(goal) {
  const stages = Array.isArray(goal.stages) ? goal.stages : [];

  if (stages.length > 0) {
    const doneCount = stages.filter((stage) => !!stage.done).length;
    return doneCount / stages.length;
  }

  return goal.status === "done" ? 1 : 0;
}

function getGoalMeta(goal) {
  const stages = Array.isArray(goal.stages) ? goal.stages : [];

  if (stages.length > 0) {
    const doneCount = stages.filter((stage) => !!stage.done).length;
    return `${doneCount}/${stages.length}`;
  }

  if (goal.goal_type === "recurring") {
    if (goal.repeat_unit === "day") return "Каждый день";
    if (goal.repeat_unit === "week") return "Каждую неделю";
    if (goal.repeat_unit === "month") return "Каждый месяц";
    return "Регулярная";
  }

  if (goal.target_date) {
    return `До ${goal.target_date}`;
  }

  return goal.status === "done" ? "Готово" : "В процессе";
}

export default function Targets() {
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    fetchGoals().then(setGoals).catch(console.error);
  }, []);

  const visibleGoals = goals
    .filter((goal) => goal.status !== "done")
    .slice(0, 4);

  if (visibleGoals.length === 0) {
    return (
      <div className="targets-widget">
        <div className="day-task-empty">Нет активных целей</div>

        <Link to="/goals" className="targets-open-link">
          Открыть
        </Link>
      </div>
    );
  }

  return (
    <div className="targets-widget">
      {visibleGoals.map((goal) => (
        <div key={goal.id} className="target-widget-item">
          <div className="target-widget-top">
            <span className="target-widget-title">{goal.title}</span>
            <span className="target-widget-percent">
              {Math.round((goal.progress || 0) * 100)}%
            </span>
          </div>

          <div className="target-widget-bar">
            <div
              className="target-widget-bar-fill"
              style={{
                width: `${Math.round((goal.progress || 0) * 100)}%`,
                backgroundColor: goal.color || "#7ECF8A",
              }}
            />
          </div>

          <div className="target-widget-meta">
            {(goal.stages || []).filter((s) => s.done).length}/
            {(goal.stages || []).length}
          </div>
        </div>
      ))}

      <Link to="/goals" className="targets-open-link">
        Открыть
      </Link>
    </div>
  );
}
