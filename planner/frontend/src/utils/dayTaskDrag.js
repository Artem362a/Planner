export function moveTaskGroup(tasks, movingIds, targetId, position) {
  const movingIdSet = new Set(movingIds);

  if (movingIdSet.size === 0 || movingIdSet.has(targetId)) return tasks;

  const movingTasks = tasks.filter((task) => movingIdSet.has(task.id));
  const remainingTasks = tasks.filter((task) => !movingIdSet.has(task.id));
  const targetIndex = remainingTasks.findIndex((task) => task.id === targetId);

  if (movingTasks.length === 0 || targetIndex === -1) return tasks;

  const insertIndex = targetIndex + (position === "after" ? 1 : 0);
  const reordered = [
    ...remainingTasks.slice(0, insertIndex),
    ...movingTasks,
    ...remainingTasks.slice(insertIndex),
  ];

  const orderChanged = reordered.some((task, index) => task.id !== tasks[index]?.id);
  if (!orderChanged) return tasks;

  return reordered.map((task, index) => ({ ...task, order_index: index }));
}
