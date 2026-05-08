import React from "react";
import GoalFocusPanel from "./GoalFocusPanel";
import { fetchGoalsForWeek, toggleGoalWeekItem } from "../../api/goals";

export default function WeekGoalsPanel({ weekStart, className = "" }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  async function loadItems() {
    try {
      setLoading(true);
      const data = await fetchGoalsForWeek(weekStart);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!weekStart) return;
    loadItems();
  }, [weekStart]);

  async function handleToggle(item) {
    try {
      const result = await toggleGoalWeekItem({
        kind: item.kind,
        goal_id: item.goal_id,
        stage_id: item.stage_id || null,
        week_start: weekStart,
      });

      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id
            ? { ...current, done: !!result.done }
            : current
        )
      );
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <GoalFocusPanel
      title="Цели недели"
      items={items}
      loading={loading}
      emptyText="На эту неделю нет целей"
      onToggle={handleToggle}
      className={className}
    />
  );
}
