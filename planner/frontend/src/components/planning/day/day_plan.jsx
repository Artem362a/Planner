import React, { useEffect, useMemo, useState } from "react";
import {
  fetchDayTasks,
  createDayTask,
  updateDayTask,
  deleteDayTask,
  fetchCategories,
} from "../../../api/tasks";

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function categoriesArrayToMap(items) {
  const result = {};
  for (const item of items) {
    result[item.key] = {
      id: item.id,
      key: item.key,
      title: item.title,
      color: item.color,
    };
  }
  return result;
}

export default function DayPlan({ selectedDate = new Date() }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [categories, setCategories] = useState({});

  const dayString = formatLocalDate(selectedDate);

  useEffect(() => {
    fetchDayTasks(dayString).then(setTasks).catch(console.error);
  }, [dayString]);

  useEffect(() => {
    fetchCategories()
      .then((items) => {
        setCategories(categoriesArrayToMap(items || []));
      })
      .catch(console.error);
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const categoryKeys = Object.keys(categories);
    const fallbackCategory =
      categoryKeys.includes("other")
        ? "other"
        : categoryKeys.includes("home")
        ? "home"
        : categoryKeys[0] || null;

    const newTask = {
      title,
      start_time: null,
      duration_min: null,
      priority: "medium",
      category: fallbackCategory,
      status: 0,
    };

    try {
      const created = await createDayTask(dayString, newTask);
      setTasks((prev) => [...prev, created]);
      setTitle("");
    } catch (err) {
      console.error(err);
    }
  };

  const toggleStatus = async (task) => {
    const newStatus = Number(task.status) === 1 ? 0 : 1;

    try {
      const updated = await updateDayTask(dayString, task.id, {
        ...task,
        status: newStatus,
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (task) => {
    try {
      await deleteDayTask(dayString, task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      console.error(err);
    }
  };

  const important = useMemo(
    () => tasks.filter((t) => t.priority === "high"),
    [tasks]
  );

  const normal = useMemo(
    () => tasks.filter((t) => t.priority !== "high"),
    [tasks]
  );

  function renderTask(task) {
    const categoryColor = categories[task.category]?.color || "#BBBBBB";
    const categoryTitle = categories[task.category]?.title || task.category;

    return (
      <li
        key={task.id}
        className={`day-plan-item ${Number(task.status) === 1 ? "done" : ""}`}
      >
        <button
          type="button"
          className="day-plan-status-btn"
          onClick={() => toggleStatus(task)}
          aria-label={
            Number(task.status) === 1
              ? "Отметить как невыполненное"
              : "Отметить как выполненное"
          }
        >
          <span
            className="day-plan-status-dot"
            style={{ backgroundColor: categoryColor }}
          />
        </button>

        <div className="day-plan-item-content">
          <div className="day-plan-item-title">{task.title}</div>

          <div className="day-plan-item-meta">
            {task.duration_min != null && <span>{task.duration_min} мин</span>}
            {categoryTitle && <span>#{categoryTitle}</span>}
          </div>
        </div>

        <button
          type="button"
          className="day-plan-delete-btn"
          onClick={() => handleDelete(task)}
          aria-label="Удалить задачу"
        >
          ×
        </button>
      </li>
    );
  }

  return (
    <div className="day-plan-card">
      <form onSubmit={handleAdd} className="day-plan-add-form">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Новая задача"
        />
        <button type="submit">Добавить</button>
      </form>

      <h3>Важные</h3>
      <ul className="day-plan-list">
        {important.map(renderTask)}
        {important.length === 0 && (
          <li className="day-plan-empty">Нет важных задач</li>
        )}
      </ul>

      <h3>Остальные</h3>
      <ul className="day-plan-list">
        {normal.map(renderTask)}
        {normal.length === 0 && (
          <li className="day-plan-empty">Нет остальных задач</li>
        )}
      </ul>
    </div>
  );
}
