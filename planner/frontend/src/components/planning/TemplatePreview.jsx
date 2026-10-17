import { formatPlanTime, clockAndDayOffsetToMinutes } from "../../utils/time";

export default function TemplatePreview({ template }) {
  const tasks = Array.isArray(template.tasks) ? template.tasks : [];
  return (
    <details className="template-preview">
      <summary>Задач в шаблоне: {tasks.length}</summary>
      {template.day_start && <p>Начало дня: {template.day_start.slice(0, 5)}</p>}
      <ul>
        {tasks.map((task, index) => (
          <li key={task.id || index}>
            <span>{task.title || task.name || "Без названия"}</span>
            {task.duration_min != null && <small>{task.duration_min} мин</small>}
            {task.start_time && <small>{formatPlanTime(clockAndDayOffsetToMinutes(task.start_time, task.start_day_offset || 0))}</small>}
            {task.task_type === "recurring" && <small>Повторяется</small>}
            {task.task_type === "volume" && <small>Объём: {task.volume_value ?? "—"}</small>}
            {task.start_offset != null && <small>{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][task.start_offset]}{task.end_offset !== task.start_offset ? `–${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][task.end_offset]}` : ""}</small>}
            {!!task.subtasks?.length && <small>Подзадач: {task.subtasks.length}</small>}
          </li>
        ))}
      </ul>
      {!tasks.length && <p>В шаблоне пока нет задач</p>}
    </details>
  );
}
