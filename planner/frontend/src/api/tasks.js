//const API_URL = "http://127.0.0.1:8000";
const API_URL = "/api";
function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem("access_token");

  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(res, errorText) {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || errorText);
  }

  return await res.json();
}

function notifyDayTasksChanged(dayString) {
  window.dispatchEvent(
    new CustomEvent("day-tasks-changed", { detail: { dayString } })
  );
}

export async function fetchDayTasks(dayString) {
  const res = await fetch(`${API_URL}/day/${dayString}`, {
    headers: getAuthHeaders(),
  });
  return await handleResponse(res, "Failed to fetch day tasks");
}

export async function createDayTask(dayString, task) {
  const res = await fetch(`${API_URL}/day/${dayString}/tasks`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(task),
  });

  const data = await handleResponse(res, "Failed to create day task");
  notifyDayTasksChanged(dayString);
  return data;
}

export async function updateDayTask(dayString, taskId, task) {
  const res = await fetch(`${API_URL}/day/${dayString}/tasks/${taskId}`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(task),
  });

  const data = await handleResponse(res, "Failed to update day task");
  notifyDayTasksChanged(dayString);
  return data;
}

export async function deleteDayTask(dayString, taskId) {
  const res = await fetch(`${API_URL}/day/${dayString}/tasks/${taskId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  const data = await handleResponse(res, "Failed to delete day task");
  notifyDayTasksChanged(dayString);
  return data;
}

export async function reorderDayTasks(dayString, orderedIds) {
  const res = await fetch(`${API_URL}/day/${dayString}/reorder`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });

  const data = await handleResponse(res, "Failed to reorder day tasks");
  notifyDayTasksChanged(dayString);
  return data;
}

export async function fetchDaySettings(dayString) {
  const res = await fetch(`${API_URL}/day/${dayString}/settings`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch day settings");
}

export async function saveDaySettings(dayString, startTime) {
  const res = await fetch(`${API_URL}/day/${dayString}/settings`, {
    method: "PUT",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ start_time: startTime }),
  });

  return await handleResponse(res, "Failed to save day settings");
}

export async function fetchDayTemplates() {
  const res = await fetch(`${API_URL}/day-templates`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch day templates");
}

export async function createDayTemplate(body) {
  const res = await fetch(`${API_URL}/day-templates`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to create day template");
}

export async function applyDayTemplate(templateId, dayString) {
  const res = await fetch(
    `${API_URL}/day-templates/${templateId}/apply/${dayString}`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    }
  );

  return await handleResponse(res, "Failed to apply day template");
}

export async function deleteDayTemplate(templateId) {
  const res = await fetch(`${API_URL}/day-templates/${templateId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to delete day template");
}

export async function fetchCategories() {
  const res = await fetch(`${API_URL}/categories`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch categories");
}

export async function createCategory(body) {
  const res = await fetch(`${API_URL}/categories`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to create category");
}

export async function updateCategory(categoryId, body) {
  const res = await fetch(`${API_URL}/categories/${categoryId}`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to update category");
}

export async function deleteCategory(categoryId) {
  const res = await fetch(`${API_URL}/categories/${categoryId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to delete category");
}

export async function fetchWeekTemplates() {
  const res = await fetch(`${API_URL}/week-templates`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch week templates");
}

export async function createWeekTemplate(body) {
  const res = await fetch(`${API_URL}/week-templates`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to create week template");
}

export async function applyWeekTemplate(templateId, weekStart) {
  const res = await fetch(`${API_URL}/week-templates/${templateId}/apply`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ week_start: weekStart }),
  });

  return await handleResponse(res, "Failed to apply week template");
}

export async function deleteWeekTemplate(templateId) {
  const res = await fetch(`${API_URL}/week-templates/${templateId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to delete week template");
}

export async function fetchWeekImportCandidates(day, daysAhead = 2, daysBack = 7) {
  const res = await fetch(
    `${API_URL}/week-import-candidates/${day}?days_ahead=${daysAhead}&days_back=${daysBack}`,
    {
      headers: getAuthHeaders(),
    }
  );

  return await handleResponse(res, "Failed to fetch week import candidates");
}

export async function importWeekTasksToDay(targetDay, items) {
  const res = await fetch(`${API_URL}/day/import-week-tasks`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      target_day: targetDay,
      items,
    }),
  });

  return await handleResponse(res, "Failed to import week tasks");
}
export async function fetchWeekTasks(weekStart) {
  const res = await fetch(`${API_URL}/week-tasks?week_start=${weekStart}`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch week tasks");
}

export async function fetchImportantWeekTasks(weekStart) {
  const res = await fetch(
    `${API_URL}/week-tasks/important?week_start=${weekStart}`,
    {
      headers: getAuthHeaders(),
    }
  );

  return await handleResponse(res, "Failed to fetch important week tasks");
}
export async function createWeekTask(body) {
  const res = await fetch(`${API_URL}/week-tasks`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to create week task");
}
export async function deleteWeekTask(taskId) {
  const res = await fetch(`${API_URL}/week-tasks/${taskId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to delete week task");
}
export async function reorderWeekTasks(orderedIds) {
  const res = await fetch(`${API_URL}/week-tasks/reorder`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });

  return await handleResponse(res, "Failed to reorder week tasks");
}
export async function updateWeekTask(taskId, body) {
  const res = await fetch(`${API_URL}/week-tasks/${taskId}`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to update week task");
}
