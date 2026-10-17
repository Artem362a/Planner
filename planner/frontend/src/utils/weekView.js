export function tasksForWeekDay(tasks, date, dayIndex) {
  return tasks.filter((task) => {
    if (task.start_date && task.start_date > date) return false;
    if (task.end_date && task.end_date < date) return false;
    return task.task_type !== "recurring" || (task.repeat_days || []).map(Number).includes(dayIndex);
  });
}
