import React from "react";

export default function GoalFocusPanel({
  title = "Цели",
  items = [],
  loading = false,
  emptyText = "На этот период нет целей",
  onToggle,
  className = "",
}) {
  return (
    <section className={`day-side-section day-goals-preview ${className}`.trim()}>
      <div className="day-side-title-row">
        <h3>{title}</h3>
      </div>

      {loading && (
        <div className="day-goals-placeholder">Загрузка...</div>
      )}

      {!loading && items.length === 0 && (
        <div className="day-goals-placeholder">{emptyText}</div>
      )}

      {!loading && items.length > 0 && (
        <div className="day-goals-list">
          {items.map((item) => {
            const showGoalTitle =
              item.goal_title &&
              item.goal_title.trim() !== String(item.title || "").trim();

            return (
              <label
                key={item.id}
                className={
                  "day-goals-item" + (item.done ? " day-goals-item--done" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={!!item.done}
                  onChange={() => onToggle?.(item)}
                />

                <span
                  className="day-goals-item-accent"
                  style={{ backgroundColor: item.color || "#7ECF8A" }}
                />

                <div className="day-goals-item-content">
                  {showGoalTitle && (
                    <div className="day-goals-item-goal">{item.goal_title}</div>
                  )}
                  <div className="day-goals-item-title">{item.title}</div>

                  {item.meta && (
                    <div className="day-goals-item-meta">{item.meta}</div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
