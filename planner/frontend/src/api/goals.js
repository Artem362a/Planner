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

function normalizeGoalPayload(body = {}) {
  return {
    title: (body.title || "").trim(),
    description: (body.description || "").trim() || null,
    color: body.color || "#7ECF8A",
    status: body.status || "active",

    goal_type: body.goal_type || "one_time",
    target_date: body.target_date || null,
    repeat_unit: body.repeat_unit || null,
    has_stages: Boolean(body.has_stages),
    schedule_mode: body.schedule_mode || null,
  };
}

function normalizeGoal(goal) {
  return {
    ...goal,
    title: goal?.title || "",
    description: goal?.description || null,
    color: goal?.color || "#7ECF8A",
    status: goal?.status || "active",
    goal_type: goal?.goal_type || "one_time",
    target_date: goal?.target_date || null,
    repeat_unit: goal?.repeat_unit || null,
    has_stages: Boolean(goal?.has_stages),
    schedule_mode: goal?.schedule_mode || null,
    stages: Array.isArray(goal?.stages) ? goal.stages : [],
    progress: typeof goal?.progress === "number" ? goal.progress : 0,
    day_done: Boolean(goal?.day_done),
  };
}

export async function fetchGoals() {
  const res = await fetch(`${API_URL}/goals`, {
    headers: getAuthHeaders(),
  });

  const data = await handleResponse(res, "Failed to fetch goals");
  return Array.isArray(data) ? data.map(normalizeGoal) : [];
}

export async function createGoal(body) {
  const res = await fetch(`${API_URL}/goals`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(normalizeGoalPayload(body)),
  });

  const data = await handleResponse(res, "Failed to create goal");
  return normalizeGoal(data);
}

export async function updateGoal(goalId, body) {
  const res = await fetch(`${API_URL}/goals/${goalId}`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(normalizeGoalPayload(body)),
  });

  const data = await handleResponse(res, "Failed to update goal");
  return normalizeGoal(data);
}

export async function deleteGoal(goalId) {
  const res = await fetch(`${API_URL}/goals/${goalId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to delete goal");
}

export async function toggleGoalFocus(goalId) {
  const res = await fetch(`${API_URL}/goals/${goalId}/focus`, {
    method: "PATCH",
    headers: getAuthHeaders(),
  });

  const data = await handleResponse(res, "Failed to toggle goal focus");
  return normalizeGoal(data);
}

export async function reorderGoals(orderedIds) {
  const res = await fetch(`${API_URL}/goals/reorder`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });

  return await handleResponse(res, "Failed to reorder goals");
}

export async function createGoalStage(goalId, body) {
  const res = await fetch(`${API_URL}/goals/${goalId}/stages`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      title: (body.title || "").trim(),
      done: Boolean(body.done),
      planned_date: body.planned_date || null,
    }),
  });

  const data = await handleResponse(res, "Failed to create goal stage");
  return normalizeGoal(data);
}

export async function updateGoalStage(goalId, stageId, body) {
  const res = await fetch(`${API_URL}/goals/${goalId}/stages/${stageId}`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      title: (body.title || "").trim(),
      done: Boolean(body.done),
      planned_date: body.planned_date || null,
    }),
  });

  const data = await handleResponse(res, "Failed to update goal stage");
  return normalizeGoal(data);
}

export async function deleteGoalStage(goalId, stageId) {
  const res = await fetch(`${API_URL}/goals/${goalId}/stages/${stageId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  const data = await handleResponse(res, "Failed to delete goal stage");
  return normalizeGoal(data);
}
export async function fetchGoalsForDay(day) {
  const res = await fetch(`${API_URL}/goals/day/${day}`, {
    headers: getAuthHeaders(),
  });

  const data = await handleResponse(res, "Failed to fetch goals for day");
  return Array.isArray(data) ? data.map(normalizeGoal) : [];
}

export async function toggleGoalDayItem(body) {
  const res = await fetch(`${API_URL}/goals/day-item/toggle`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  const data = await handleResponse(res, "Failed to toggle day goal item");
  return normalizeGoal(data);
}

export async function fetchGoalsForWeek(weekStart) {
  const res = await fetch(`${API_URL}/goals/week?week_start=${weekStart}`, {
    headers: getAuthHeaders(),
  });

  return await handleResponse(res, "Failed to fetch goals for week");
}

export async function toggleGoalWeekItem(body) {
  const res = await fetch(`${API_URL}/goals/week-item/toggle`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  return await handleResponse(res, "Failed to toggle week goal item");
}
