import React, { useEffect, useMemo, useState } from "react";
import { fetchImportantWeekTasks, fetchCategories } from "../../../api/tasks";

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekLabel(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return `${weekStart.toLocaleDateString("ru-RU")} – ${weekEnd.toLocaleDateString("ru-RU")}`;
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getTaskOffset(taskDate, weekStart) {
  const task = new Date(taskDate);
  task.setHours(0, 0, 0, 0);

  const diffMs = task.getTime() - weekStart.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function groupConsecutiveDays(days) {
  if (!Array.isArray(days) || days.length === 0) return [];

  const sorted = [...new Set(days)]
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b);

  if (sorted.length === 0) return [];

  const groups = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];

    if (current === end + 1) {
      end = current;
    } else {
      groups.push({ start, end });
      start = current;
      end = current;
    }
  }

  groups.push({ start, end });
  return groups;
}

function categoriesArrayToMap(items) {
  const result = {};
  for (const item of items) {
    result[item.key] = {
      id: item.id,
      title: item.title,
      color: item.color,
    };
  }
  return result;
}

const FALLBACK_COLOR = "#BBBBBB";

const WeekPlan = ({ selectedDate }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState({});

  const weekStart = useMemo(
    () => getMonday(selectedDate || new Date()),
    [selectedDate]
  );

  const weekLabel = useMemo(() => formatWeekLabel(weekStart), [weekStart]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);

      return {
        key: formatDate(d),
        shortName: d
          .toLocaleDateString("ru-RU", { weekday: "short" })
          .toUpperCase(),
      };
    });
  }, [weekStart]);

  useEffect(() => {
    fetchCategories()
      .then((items) => {
        setCategories(categoriesArrayToMap(items || []));
      })
      .catch((e) => {
        console.error("Failed to load categories:", e);
        setCategories({});
      });
  }, []);

  useEffect(() => {
    async function loadImportant() {
      setLoading(true);
      try {
        const data = await fetchImportantWeekTasks(formatDate(weekStart));
        setTasks(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Failed to load important week tasks:", e);
        setTasks([]);
      } finally {
        setLoading(false);
      }
    }

    loadImportant();
  }, [weekStart]);

  return (
    <div className="week-content">
      <div className="week-mini-header">
        <div className="week-mini-label">{weekLabel}</div>
      </div>

      <div className="week-mini-grid-header">
        {days.map((day) => (
          <div key={day.key} className="week-mini-day">
            {day.shortName}
          </div>
        ))}
      </div>

      <div className="week-mini-scroll">
        <div className="week-mini-grid-body">
          {loading && <div className="week-empty-text">Загрузка...</div>}

          {!loading && tasks.length === 0 && (
            <div className="week-empty-text">
              Нет важных задач на этой неделе
            </div>
          )}

          {!loading &&
            tasks.map((task) => {
              const color = categories[task.category]?.color || FALLBACK_COLOR;
              const isRecurring = task.task_type === "recurring";
              const recurringGroups = isRecurring
                ? groupConsecutiveDays(task.repeat_days || [])
                : [];

              const rawStart = getTaskOffset(task.start_date, weekStart);
              const rawEnd = getTaskOffset(task.end_date, weekStart);

              const start = Math.max(0, Math.min(6, rawStart));
              const end = Math.max(0, Math.min(6, rawEnd));
              const span = Math.max(1, end - start + 1);

              return (
                <div key={task.id} className="week-mini-task-card">
                  <div className="week-mini-task-top">
                    <div className="week-mini-task-left">
                      <span
                        className="week-mini-task-dot"
                        style={{ backgroundColor: color }}
                      />
                      <div className="week-mini-task-title" title={task.name}>
                        {task.name}
                      </div>
                    </div>

                    <div className="week-mini-task-dates">
                      {isRecurring
                        ? "Повтор"
                        : `${formatShortDate(task.start_date)} – ${formatShortDate(
                            task.end_date
                          )}`}
                    </div>
                  </div>

                  <div className="week-mini-track">
                    {Array.from({ length: 6 }).map((_, lineIndex) => (
                      <div
                        key={lineIndex}
                        className="week-mini-separator"
                        style={{
                          left: `${((lineIndex + 1) * 100) / 7}%`,
                        }}
                      />
                    ))}

                    {isRecurring
                      ? recurringGroups.map((group, groupIndex) => {
                          const groupSpan = group.end - group.start + 1;

                          return (
                            <div
                              key={`${task.id}-repeat-${groupIndex}`}
                              className="week-mini-bar"
                              style={{
                                left: `calc(${group.start} * (100% / 7) + 4px)`,
                                width: `calc(${groupSpan} * (100% / 7) - 8px)`,
                                backgroundColor: color,
                              }}
                            />
                          );
                        })
                      : (
                        <div
                          className="week-mini-bar"
                          style={{
                            left: `calc(${start} * (100% / 7) + 4px)`,
                            width: `calc(${span} * (100% / 7) - 8px)`,
                            backgroundColor: color,
                          }}
                        />
                      )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default WeekPlan;
