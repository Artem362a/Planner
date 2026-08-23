import { useEffect, useState } from "react";
import { fetchGoals } from "../../api/goals";

export default function Targets() {
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    fetchGoals().then(setGoals).catch(console.error);
  }, []);

  const activeGoals = goals.filter((goal) => goal.status !== "done");
  const focusedGoals = activeGoals.filter((goal) => goal.is_focus);
  const visibleGoals = focusedGoals.length > 0 ? focusedGoals : activeGoals.slice(0, 4);

  if (visibleGoals.length === 0) {
    return (
      <div className="targets-widget">
        <div className="day-task-empty">Нет активных целей</div>
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
    </div>
  );
}
