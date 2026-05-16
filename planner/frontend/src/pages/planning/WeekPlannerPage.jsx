import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CategorySelect from "../../components/forms/CategorySelect";
import CategoryManagerModal from "../../components/categories/CategoryManagerModal";
import WeekGoalsPanel from "../../components/goals/WeekGoalsPanel";
import { CategoryIcon } from "../../components/icons";
import {
  fetchCategories,
  createWeekTemplate,
  fetchWeekTemplates,
  applyWeekTemplate,
  deleteWeekTemplate,
  fetchWeekTasks,
  createWeekTask,
  updateWeekTask,
  deleteWeekTask,
  reorderWeekTasks,
} from "../../api/tasks";


function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function categoriesArrayToMap(items) {
  const result = {};
  for (const item of items) {
    result[item.key] = {
      id: item.id,
      title: item.title,
      color: item.color,
      icon: item.icon || "tag",
    };
  }
  return result;
}

function getDefaultCategoryKey(categories) {
  if (categories.home) return "home";
  const keys = Object.keys(categories);
  return keys[0] || "";
}

const WEEK_DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function groupConsecutiveDays(days) {
  if (!Array.isArray(days) || days.length === 0) return [];

  const sorted = [...new Set(days)]
    .map(Number)
    .filter((n) => !Number.isNaN(n))
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

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function isTaskOverdue(task) {
  if (Number(task.status) === 1) return false;
  if ((task.task_type || "").trim() === "recurring") return false;
  if (!task.end_date) return false;

  const end = parseLocalDate(task.end_date);
  end.setHours(0, 0, 0, 0);

  return end < startOfToday();
}

function WeekPlannerPage() {
  const [searchParams] = useSearchParams();
  const initialDateParam = searchParams.get("date");
  const initialDate = initialDateParam
    ? parseLocalDate(initialDateParam)
    : new Date();

  const [dragTaskId, setDragTaskId] = useState(null);
  const [weekStart, setWeekStart] = useState(() => getMonday(initialDate));
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState({});
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const [form, setForm] = useState({
    name: "",
    category: "",
    important: false,
    startOffset: 0,
    endOffset: 0,
    rangeAnchor: null,
    taskType: "normal",
    repeatDays: [],
    volumeValue: "",
    subtasks: [],
  });

  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [inlineSubtaskTitles, setInlineSubtaskTitles] = useState({});

  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [isApplyTemplateOpen, setIsApplyTemplateOpen] = useState(false);
  const [isWeekGoalsOpen, setIsWeekGoalsOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateColor, setTemplateColor] = useState("#f0e7ff");
  const [templates, setTemplates] = useState([]);

  async function loadCategories() {
    try {
      const items = await fetchCategories();
      const mapped = categoriesArrayToMap(items || []);
      setCategories(mapped);

      setForm((prev) => ({
        ...prev,
        category:
          prev.category && mapped[prev.category]
            ? prev.category
            : getDefaultCategoryKey(mapped),
      }));
    } catch (e) {
      console.error(e);
      setCategories({});
    }
  }

  async function reloadCategories() {
    await loadCategories();
  }

  async function loadTasks(currentWeekStart) {
    setLoading(true);
    try {
      const data = await fetchWeekTasks(formatLocalDate(currentWeekStart));
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadWeekTemplates() {
    try {
      const data = await fetchWeekTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setTemplates([]);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadTasks(weekStart);
  }, [weekStart]);

  function goPrevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }

  function goNextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  const weekLabel = `${weekStart.toLocaleDateString(
    "ru-RU"
  )} – ${weekEnd.toLocaleDateString("ru-RU")}`;

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);

      return {
        date: d,
        str: formatLocalDate(d),
        key: formatLocalDate(d),
      };
    });
  }, [weekStart]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDone = Number(a.status) === 1;
      const bDone = Number(b.status) === 1;

      if (aDone !== bDone) {
        return aDone ? 1 : -1;
      }

      const aImportant = !!a.important;
      const bImportant = !!b.important;

      if (aImportant !== bImportant) {
        return aImportant ? -1 : 1;
      }

      const aCategoryTitle =
        (categories[a.category]?.title || a.category || "яяя").toLowerCase();
      const bCategoryTitle =
        (categories[b.category]?.title || b.category || "яяя").toLowerCase();

      if (aCategoryTitle !== bCategoryTitle) {
        return aCategoryTitle.localeCompare(bCategoryTitle, "ru");
      }

      const orderA = a.order_index ?? 0;
      const orderB = b.order_index ?? 0;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return (a.id ?? 0) - (b.id ?? 0);
    });
  }, [tasks, categories]);

  function buildWeeklyTemplatePayload() {
    return {
      name: templateName.trim(),
      color: templateColor,
      tasks: sortedTasks.map((task) => {
        const start = parseLocalDate(task.start_date);
        const end = parseLocalDate(task.end_date);

        const startOffset = Math.round(
          (start.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
        );
        const endOffset = Math.round(
          (end.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          name: task.name,
          category: task.category,
          important: !!task.important,
          status: Number(task.status ?? 0),
          task_type: task.task_type || "normal",
          repeat_days: Array.isArray(task.repeat_days) ? task.repeat_days : [],
          volume_value: task.volume_value ?? null,
          start_offset: Math.max(0, Math.min(6, startOffset)),
          end_offset: Math.max(0, Math.min(6, endOffset)),
          subtasks: task.subtasks || [],
        };
      }),
    };
  }

  function openSaveTemplateModal() {
    setTemplateName("");
    setTemplateColor("#f0e7ff");
    setIsSaveTemplateOpen(true);
  }

  function closeSaveTemplateModal() {
    setIsSaveTemplateOpen(false);
  }

  async function saveWeekTemplateHandler() {
    if (!templateName.trim()) return;

    try {
      await createWeekTemplate(buildWeeklyTemplatePayload());
      setIsSaveTemplateOpen(false);
      setTemplateName("");
      await loadWeekTemplates();
    } catch (e) {
      console.error(e);
    }
  }

  async function applyWeekTemplateHandler(templateId) {
    try {
      await applyWeekTemplate(templateId, formatLocalDate(weekStart));
      await loadTasks(weekStart);
      setIsApplyTemplateOpen(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteWeekTemplateHandler(template) {
    const ok = window.confirm(`Удалить шаблон "${template.name}"?`);
    if (!ok) return;

    try {
      await deleteWeekTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleWeekTaskStatus(task) {
    const nextStatus = Number(task.status) === 1 ? 0 : 1;
    const updated = { ...task, status: nextStatus };

    try {
      const saved = await updateWeekTask(task.id, updated);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch (e) {
      console.error(e);
    }
  }

  function openCreateModal() {
    setEditingTask(null);
    setForm({
      name: "",
      category: getDefaultCategoryKey(categories),
      important: false,
      startOffset: 0,
      endOffset: 0,
      rangeAnchor: null,
      taskType: "normal",
      repeatDays: [],
      volumeValue: "",
      subtasks: [],
    });
    setNewSubtaskTitle("");
    setIsModalOpen(true);
  }

  function openEditModal(task) {
    const start = parseLocalDate(task.start_date);
    const end = parseLocalDate(task.end_date);

    const startOffset = Math.round(
      (start.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const endOffset = Math.round(
      (end.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    setEditingTask(task);
    setForm({
      name: task.name || "",
      category: task.category || getDefaultCategoryKey(categories),
      important: !!task.important,
      startOffset: Math.max(0, Math.min(6, startOffset)),
      endOffset: Math.max(0, Math.min(6, endOffset)),
      rangeAnchor: null,
      taskType: task.task_type || "normal",
      repeatDays: task.repeat_days || [],
      volumeValue: task.volume_value ?? "",
      subtasks: task.subtasks || [],
    });
    setNewSubtaskTitle("");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingTask(null);
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function addSubtaskToForm(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const title = newSubtaskTitle.trim();
    if (!title) return;

    const newSub = {
      id: Date.now(),
      title,
      done: false,
    };

    setForm((prev) => ({
      ...prev,
      subtasks: [...prev.subtasks, newSub],
    }));

    setNewSubtaskTitle("");
  }

  function removeSubtaskFromForm(id) {
    setForm((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((s) => s.id !== id),
    }));
  }

  function toggleRepeatDay(dayIndex) {
    setForm((prev) => {
      const exists = prev.repeatDays.includes(dayIndex);

      return {
        ...prev,
        repeatDays: exists
          ? prev.repeatDays.filter((d) => d !== dayIndex)
          : [...prev.repeatDays, dayIndex].sort((a, b) => a - b),
      };
    });
  }

  function selectNormalRangeDay(dayIndex) {
    setForm((prev) => {
      if (prev.rangeAnchor === null || prev.rangeAnchor === undefined) {
        return {
          ...prev,
          startOffset: dayIndex,
          endOffset: dayIndex,
          rangeAnchor: dayIndex,
        };
      }

      return {
        ...prev,
        startOffset: Math.min(prev.rangeAnchor, dayIndex),
        endOffset: Math.max(prev.rangeAnchor, dayIndex),
        rangeAnchor: null,
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;

    let startOffset = Number(form.startOffset);
    let endOffset = Number(form.endOffset);

    if (form.taskType === "recurring") {
      startOffset = 0;
      endOffset = 6;
    } else if (endOffset < startOffset) {
      endOffset = startOffset;
    }

    const startDate = new Date(weekStart);
    startDate.setDate(startDate.getDate() + startOffset);

    const endDate = new Date(weekStart);
    endDate.setDate(endDate.getDate() + endOffset);

    const baseBody = {
      name: form.name.trim(),
      start_date: formatLocalDate(startDate),
      end_date: formatLocalDate(endDate),
      category: form.category || null,
      important: form.important,
      status: editingTask?.status ?? 0,
      task_type: form.taskType,
      repeat_days: form.taskType === "recurring" ? form.repeatDays : [],
      volume_value:
        form.taskType === "volume" && form.volumeValue !== ""
          ? Number(form.volumeValue)
          : null,
      subtasks: form.subtasks,
    };

    try {
      if (!editingTask) {
        const created = await createWeekTask(baseBody);
        setTasks((prev) => [...prev, created]);
      } else {
        const updated = await updateWeekTask(editingTask.id, {
          ...editingTask,
          ...baseBody,
        });
        setTasks((prev) =>
          prev.map((t) => (t.id === editingTask.id ? updated : t))
        );
      }

      closeModal();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDelete(task) {
    try {
      await deleteWeekTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (e) {
      console.error(e);
    }
  }

  function setInlineTitle(taskId, value) {
    setInlineSubtaskTitles((prev) => ({ ...prev, [taskId]: value }));
  }

  async function addSubtaskInline(task, title) {
    const trimmed = title.trim();
    if (!trimmed) return;

    const newSub = {
      id: Date.now(),
      title: trimmed,
      done: false,
    };

    const updatedTask = {
      ...task,
      name: task.name,
      start_date: task.start_date,
      end_date: task.end_date,
      category: task.category,
      important: task.important,
      status: task.status ?? 0,
      task_type: task.task_type || "normal",
      repeat_days: task.repeat_days || [],
      volume_value: task.volume_value ?? null,
      subtasks: [...(task.subtasks || []), newSub],
    };

    try {
      const saved = await updateWeekTask(task.id, updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch (e) {
      console.error(e);
    }
  }

  async function removeSubtaskInline(task, subtaskId) {
    const updatedTask = {
      ...task,
      subtasks: (task.subtasks || []).filter((s) => s.id !== subtaskId),
    };

    try {
      const saved = await updateWeekTask(task.id, updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleSubtask(task, subtask) {
    const updatedSub = { ...subtask, done: !subtask.done };
    const updatedTask = {
      ...task,
      subtasks: (task.subtasks || []).map((s) =>
        s.id === subtask.id ? updatedSub : s
      ),
    };

    try {
      const saved = await updateWeekTask(task.id, updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch (e) {
      console.error(e);
    }
  }

  function toggleExpandedTask(taskId) {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  }

  function handleDragStart(taskId) {
    setDragTaskId(taskId);
  }

  function handleDragOver(e, overTaskId) {
    e.preventDefault();

    if (dragTaskId === null || dragTaskId === overTaskId) return;

    setTasks((prev) => {
      const ordered = [...prev].sort((a, b) => {
        const aDone = Number(a.status) === 1;
        const bDone = Number(b.status) === 1;

        if (aDone !== bDone) {
          return aDone ? 1 : -1;
        }

        if (!!a.important !== !!b.important) {
          return a.important ? -1 : 1;
        }

        return (a.order_index ?? 0) - (b.order_index ?? 0);
      });

      const fromIndex = ordered.findIndex((t) => t.id === dragTaskId);
      const toIndex = ordered.findIndex((t) => t.id === overTaskId);

      if (fromIndex === -1 || toIndex === -1) return prev;

      const next = [...ordered];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      return next.map((task, index) => ({
        ...task,
        order_index: index,
      }));
    });

    setDragTaskId(overTaskId);
  }

function getTaskProgressMeta(task) {
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const total = subtasks.length;
  const done = subtasks.filter((subtask) => !!subtask.done).length;
  const isDone = Number(task.status) === 1;

  return {
    total,
    done,
    progress: isDone ? 1 : total > 0 ? done / total : 0,
    hasSubtasks: total > 0,
    isDone,
  };
}

function renderWeekTaskBar(
  task,
  left,
  width,
  color,
  overdue = false,
  extraKey = ""
) {
  const { total, done, progress, hasSubtasks, isDone } =
    getTaskProgressMeta(task);

  const baseClass =
    "week-grid-task-bar " +
    (task.important
      ? "week-grid-task-bar--important"
      : "week-grid-task-bar--normal") +
    (isDone ? " week-grid-task-bar--done" : "") +
    (overdue ? " week-grid-task-bar--overdue" : "");

  if (isDone) {
    return (
      <div
        key={`${task.id}-${extraKey}`}
        className={baseClass}
        style={{
          left,
          width,
          backgroundColor: color,
        }}
        title="Задача выполнена"
      />
    );
  }

  if (!hasSubtasks) {
    return (
      <div
        key={`${task.id}-${extraKey}`}
        className={baseClass}
        style={{
          left,
          width,
          backgroundColor: color,
        }}
      />
    );
  }

  return (
    <div
      key={`${task.id}-${extraKey}`}
      className={
        "week-grid-task-progress" +
        (overdue ? " week-grid-task-progress--overdue" : "")
      }
      style={{
        left,
        width,
      }}
      title={`Выполнено ${done} из ${total} подзадач`}
    >
      <div
        className="week-grid-task-progress-track"
        style={{
          backgroundColor: overdue
            ? hexToRgba("#d46a6a", 0.22)
            : hexToRgba(color, 0.22),
          borderColor: overdue
            ? hexToRgba("#b94d4d", 0.34)
            : hexToRgba(color, 0.34),
        }}
      />
      {progress > 0 && (
        <div
          className="week-grid-task-progress-fill"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: overdue ? "#d46a6a" : color,
          }}
        />
      )}
    </div>
  );
}

function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(187, 187, 187, ${alpha})`;

  const clean = hex.replace("#", "");
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : clean;

  const bigint = parseInt(normalized, 16);

  if (Number.isNaN(bigint)) {
    return `rgba(187, 187, 187, ${alpha})`;
  }

  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderRecurringTaskBar(task, color, overdue = false) {
  const repeatDays = [...new Set((task.repeat_days || []).map(Number))]
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);

  if (repeatDays.length === 0) return null;

  const groups = groupConsecutiveDays(repeatDays);
  const { total, done, progress, hasSubtasks, isDone } =
    getTaskProgressMeta(task);

  if (isDone) {
    return groups.map((group, groupIndex) => (
      <div
        key={`${task.id}-recurring-done-${groupIndex}`}
        className={
          "week-grid-task-bar " +
          (group.start === group.end ? "week-grid-task-bar--single " : "") +
          (task.important
            ? "week-grid-task-bar--important"
            : "week-grid-task-bar--normal") +
          " week-grid-task-bar--done" +
          (overdue ? " week-grid-task-bar--overdue" : "")
        }
        style={{
          left: `calc(${group.start} * (100% / 7) + 6px)`,
          width: `calc(${group.end - group.start + 1} * (100% / 7) - 12px)`,
          backgroundColor: color,
        }}
      />
    ));
  }

  if (!hasSubtasks) {
    return groups.map((group, groupIndex) => (
      <div
        key={`${task.id}-recurring-plain-${groupIndex}`}
        className={
          "week-grid-task-bar " +
          (group.start === group.end ? "week-grid-task-bar--single " : "") +
          (task.important
            ? "week-grid-task-bar--important"
            : "week-grid-task-bar--normal") +
          (overdue ? " week-grid-task-bar--overdue" : "")
        }
        style={{
          left: `calc(${group.start} * (100% / 7) + 6px)`,
          width: `calc(${group.end - group.start + 1} * (100% / 7) - 12px)`,
          backgroundColor: color,
        }}
      />
    ));
  }

  const totalSegments = repeatDays.length;

  return groups.map((group, groupIndex) => {
    const groupDays = [];
    for (let day = group.start; day <= group.end; day += 1) {
      groupDays.push(day);
    }

    const groupStartIndex = repeatDays.indexOf(group.start);

    return (
      <div
        key={`${task.id}-recurring-progress-${groupIndex}`}
        className={
          "week-grid-task-recurring-progress" +
          (overdue ? " week-grid-task-progress--overdue" : "")
        }
        style={{
          left: `calc(${group.start} * (100% / 7) + 6px)`,
          width: `calc(${group.end - group.start + 1} * (100% / 7) - 12px)`,
          gridTemplateColumns: `repeat(${groupDays.length}, 1fr)`,
        }}
        title={`Выполнено ${done} из ${total} подзадач`}
      >
        {groupDays.map((day, localIndex) => {
          const absoluteSegmentIndex = groupStartIndex + localIndex;
          const startPart = absoluteSegmentIndex / totalSegments;
          const endPart = (absoluteSegmentIndex + 1) / totalSegments;

          let segmentProgress = 0;

          if (progress >= endPart) {
            segmentProgress = 1;
          } else if (progress <= startPart) {
            segmentProgress = 0;
          } else {
            segmentProgress = (progress - startPart) / (endPart - startPart);
          }

          return (
            <div
              key={`${task.id}-recurring-progress-${groupIndex}-${localIndex}`}
              className="week-grid-task-recurring-segment"
            >
              <div
                className="week-grid-task-progress-track"
                style={{
                  backgroundColor: overdue
                    ? hexToRgba("#d46a6a", 0.22)
                    : hexToRgba(color, 0.22),
                  borderColor: overdue
                    ? hexToRgba("#b94d4d", 0.34)
                    : hexToRgba(color, 0.34),
                }}
              />
              {segmentProgress > 0 && (
                <div
                  className="week-grid-task-progress-fill"
                  style={{
                    width: `${segmentProgress * 100}%`,
                    backgroundColor: overdue ? "#d46a6a" : color,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  });
}

function handleDragStart(taskId) {
  setDragTaskId(taskId);
}

function handleDragOver(e, overTaskId) {
  e.preventDefault();

  if (dragTaskId === null || dragTaskId === overTaskId) return;

  setTasks((prev) => {
    const ordered = [...prev].sort((a, b) => {
      const aDone = Number(a.status) === 1;
      const bDone = Number(b.status) === 1;

      if (aDone !== bDone) {
        return aDone ? 1 : -1;
      }

      if (!!a.important !== !!b.important) {
        return a.important ? -1 : 1;
      }

      return (a.order_index ?? 0) - (b.order_index ?? 0);
    });

    const fromIndex = ordered.findIndex((t) => t.id === dragTaskId);
    const toIndex = ordered.findIndex((t) => t.id === overTaskId);

    if (fromIndex === -1 || toIndex === -1) return prev;

    const next = [...ordered];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    return next.map((task, index) => ({
      ...task,
      order_index: index,
    }));
  });

  setDragTaskId(overTaskId);
}

async function handleDragEnd() {
  setDragTaskId(null);

  try {
    const orderedIds = [...tasks]
      .sort((a, b) => {
        const aDone = Number(a.status) === 1;
        const bDone = Number(b.status) === 1;

        if (aDone !== bDone) {
          return aDone ? 1 : -1;
        }

        if (!!a.important !== !!b.important) {
          return a.important ? -1 : 1;
        }

        return (a.order_index ?? 0) - (b.order_index ?? 0);
      })
      .map((t) => t.id);

    await reorderWeekTasks(orderedIds);
  } catch (e) {
    console.error(e);
  }
}

  return (
    <div className="app-wrapper">
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <Link to="/" className="back-link">
              ←
            </Link>
          </div>

          <div className="app-header-center">
            ПЛАН НА НЕДЕЛЮ {formatLocalDate(weekStart)}
          </div>

          <div className="app-header-right" />
        </header>

        <main className="day-page-main">
          <div className="day-big-card">
            <section className="day-tasks-page">
              <div className="page-tasks-wrapper">
                <div className="week-period-switcher">
                  <button
                    type="button"
                    className="week-nav-btn"
                    onClick={goPrevWeek}
                    aria-label="Предыдущая неделя"
                  >
                    ←
                  </button>

                  <h2 className="week-period-label">{weekLabel}</h2>

                  <button
                    type="button"
                    className="week-nav-btn"
                    onClick={goNextWeek}
                    aria-label="Следующая неделя"
                  >
                    →
                  </button>
                </div>

                <div className="day-templates-buttons">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={openSaveTemplateModal}
                  >
                    Сохранить как шаблон
                  </button>

                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={async () => {
                      await loadWeekTemplates();
                      setIsApplyTemplateOpen(true);
                    }}
                  >
                    Применить шаблон
                  </button>

                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setIsWeekGoalsOpen(true)}
                  >
                    Цели
                  </button>
                </div>

                <div className="week-grid-excel">
                  <div className="week-grid-header">
                    <div className="week-grid-cell week-grid-cell--corner">
                      Задача
                    </div>

                    {weekDays.map(({ date, key }) => (
                      <div
                        key={key}
                        className="week-grid-cell week-grid-cell--day"
                      >
                        {date.toLocaleDateString("ru-RU", {
                          weekday: "short",
                        })}
                        <br />
                        {date.getDate()}.{date.getMonth() + 1}
                      </div>
                    ))}
                  </div>

                  <div className="week-grid-body">
                    {sortedTasks.map((t) => {
                      const startIndex = weekDays.findIndex(
                        ({ str }) => str === t.start_date
                      );
                      const endIndex = weekDays.findIndex(
                        ({ str }) => str === t.end_date
                      );

                      const safeStart = startIndex === -1 ? 0 : startIndex;
                      const safeEnd = endIndex === -1 ? 6 : endIndex;
                      const color = categories[t.category]?.color || "#dcdcff";
                      const overdue = isTaskOverdue(t);

                      return (
                        <div
                          key={t.id}
                          className={
                            "week-grid-row" +
                            (Number(t.status) === 1 ? " week-grid-row--done" : "") +
                            (overdue ? " week-grid-row--overdue" : "")
                          }
                        >
                          <div
                            className={
                              "week-grid-cell week-grid-cell--task-name" +
                              (t.important ? " week-grid-cell--task-name-important" : "") +
                              (Number(t.status) === 1 ? " week-grid-cell--task-name-done" : "") +
                              (overdue ? " week-grid-cell--task-name-overdue" : "")
                            }
                          >
                            <span
                              className="week-task-category-icon"
                              style={{
                                color,
                                backgroundColor: hexToRgba(color, 0.14),
                              }}
                            >
                              <CategoryIcon name={categories[t.category]?.icon || "tag"} />
                            </span>

                            <span className="week-task-name-text">
                              {Number(t.status) === 1 ? "✓ " : ""}
                              {t.name}
                            </span>
                          </div>

                          <div className="week-grid-days-track">
                            {weekDays.map(({ str }) => (
                              <div
                                key={str}
                                className="week-grid-cell week-grid-cell--day-box"
                              />
                            ))}

                            {t.task_type === "recurring"
                            ? renderRecurringTaskBar(t, color, overdue)
                            : renderWeekTaskBar(
                                t,
                                `calc(${safeStart} * (100% / 7) + 6px)`,
                                `calc(${safeEnd - safeStart + 1} * (100% / 7) - 12px)`,
                                color,
                                overdue,
                                "range"
                              )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {loading && <div className="week-loading">Загрузка...</div>}

                <ul className="day-tasks-list">
                  {sortedTasks.map((t) => (
                    <li
                      key={t.id}
                      className={
                        "day-task-item" +
                        (Number(t.status) === 1 ? " done" : "")
                      }
                      draggable
                      onDragStart={() => handleDragStart(t.id)}
                      onDragOver={(e) => handleDragOver(e, t.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="day-task-drag-handle">⋮⋮</div>

                      <label className="day-task-checkbox">
                        <input
                          type="checkbox"
                          checked={Number(t.status) === 1}
                          onChange={() => toggleWeekTaskStatus(t)}
                        />
                        <span />
                      </label>

                      <div className="day-task-content">
                        <div className="day-task-title">{t.name}</div>

                        <div className="day-task-meta">
                          {t.category && (
                            <span className="week-task-meta-category">
                              <span
                                className="week-task-meta-icon"
                                style={{
                                  color:
                                    categories[t.category]?.color || "#BBBBBB",
                                  backgroundColor: hexToRgba(
                                    categories[t.category]?.color || "#BBBBBB",
                                    0.14
                                  ),
                                }}
                              >
                                <CategoryIcon
                                  name={categories[t.category]?.icon || "tag"}
                                />
                              </span>
                              #{categories[t.category]?.title || t.category}
                            </span>
                          )}

                          <span>
                            {t.start_date} – {t.end_date}
                          </span>

                          {t.task_type === "recurring" && (
                            <span className="tag tag-light">повтор</span>
                          )}

                          {t.task_type === "volume" && (
                            <span className="tag tag-light">
                              объём
                              {t.volume_value != null
                                ? `: ${t.volume_value}`
                                : ""}
                            </span>
                          )}

                          {t.subtasks && t.subtasks.length > 0 && (
                            <button
                              type="button"
                              className="subtasks-count-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpandedTask(t.id);
                              }}
                            >
                              {t.subtasks.length} подзадач
                              {expandedTaskId === t.id ? " ▲" : " ▼"}
                            </button>
                          )}

                          {t.important && (
                            <span className="tag tag-important">важно</span>
                          )}
                        </div>

                        {expandedTaskId === t.id && (
                          <div className="subtasks-inline-block">
                            {t.subtasks && t.subtasks.length > 0 && (
                              <ul className="subtasks-list">
                                {t.subtasks.map((s) => (
                                  <li key={s.id} className="subtask-item">
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked={!!s.done}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          toggleSubtask(t, s);
                                        }}
                                      />
                                      <span>{s.title}</span>
                                    </label>

                                    <button
                                      type="button"
                                      className="subtask-remove-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeSubtaskInline(t, s.id);
                                      }}
                                    >
                                      ×
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}

                            <div className="subtask-inline-add-row">
                              <input
                                type="text"
                                placeholder="Новая подзадача"
                                value={inlineSubtaskTitles[t.id] || ""}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setInlineTitle(t.id, e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    await addSubtaskInline(
                                      t,
                                      inlineSubtaskTitles[t.id] || ""
                                    );

                                    setInlineTitle(t.id, "");
                                  }
                                }}
                              />

                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();

                                  await addSubtaskInline(
                                    t,
                                    inlineSubtaskTitles[t.id] || ""
                                  );

                                  setInlineTitle(t.id, "");
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div
                        className="day-task-color"
                        style={{
                          backgroundColor:
                            categories[t.category]?.color || "#BBBBBB",
                        }}
                      />

                      <div className="day-task-actions">
                        <button
                          type="button"
                          className="day-task-delete"
                          onClick={() => handleDelete(t)}
                        >
                          ×
                        </button>

                        <button
                          type="button"
                          className="day-task-edit"
                          onClick={() => openEditModal(t)}
                        >
                          ✎
                        </button>
                      </div>
                    </li>
                  ))}

                  {tasks.length === 0 && !loading && (
                    <li className="day-task-empty">
                      Пока нет задач на эту неделю
                    </li>
                  )}
                </ul>
              </div>

              <button
                type="button"
                className="fab-button"
                onClick={openCreateModal}
              >
                +
              </button>
            </section>

            {isModalOpen && (
              <div className="modal-overlay">
                <div
                  className={
                    "modal" + (form.taskType === "recurring" ? " modal-wide" : "")
                  }
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3>
                    {editingTask
                      ? "Редактировать задачу недели"
                      : "Новая задача на неделю"}
                  </h3>

                  <form onSubmit={handleSubmit} className="task-modal-form">
                    <label>
                      Название
                      <input
                        type="text"
                        name="name"
                        value={form.name}
                        onChange={handleFormChange}
                        placeholder="Например, Прога Week"
                      />
                    </label>

                    <label>
                      Категория
                      <CategorySelect
                        value={form.category}
                        categories={categories}
                        onChange={(newCategory) =>
                          setForm((prev) => ({ ...prev, category: newCategory }))
                        }
                        onManageClick={() => setIsCategoryManagerOpen(true)}
                      />
                    </label>

                    <div className="week-task-type-block">
                      <div className="week-task-type-title">Тип задачи</div>

                      <div className="week-task-type-row">
                        <label className="week-task-type-option">
                          <input
                            type="radio"
                            name="taskType"
                            value="normal"
                            checked={form.taskType === "normal"}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                taskType: e.target.value,
                                rangeAnchor: null,
                              }))
                            }
                          />
                          <span>Обычная</span>
                        </label>

                        <label className="week-task-type-option">
                          <input
                            type="radio"
                            name="taskType"
                            value="recurring"
                            checked={form.taskType === "recurring"}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                taskType: e.target.value,
                                rangeAnchor: null,
                              }))
                            }
                          />
                          <span>Повторяющаяся</span>
                        </label>

                        <label className="week-task-type-option">
                          <input
                            type="radio"
                            name="taskType"
                            value="volume"
                            checked={form.taskType === "volume"}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                taskType: e.target.value,
                                rangeAnchor: null,
                              }))
                            }
                          />
                          <span>Объёмная</span>
                        </label>
                      </div>
                    </div>

                    <div className="week-important-row">
                      <label className="week-checkbox-pretty">
                        <input
                          type="checkbox"
                          name="important"
                          checked={form.important}
                          onChange={handleFormChange}
                        />
                        <span className="week-checkbox-box"></span>
                        <span className="week-checkbox-text">Важно</span>
                      </label>
                    </div>

                    {form.taskType !== "recurring" && (
                      <div className="week-repeat-block week-range-block">
                        <div className="week-repeat-title">
                          Дни выполнения
                        </div>

                        <div className="week-repeat-days week-range-days">
                          {WEEK_DAY_LABELS.map((label, index) => {
                            const start = Number(form.startOffset);
                            const end = Number(form.endOffset);
                            const rangeStart = Math.min(start, end);
                            const rangeEnd = Math.max(start, end);
                            const isSelected =
                              index >= rangeStart && index <= rangeEnd;
                            const isEdge =
                              index === rangeStart || index === rangeEnd;
                            const isAnchor = form.rangeAnchor === index;

                            return (
                              <label
                                key={index}
                                className={
                                  "week-repeat-day week-range-day" +
                                  (isSelected ? " is-selected" : "") +
                                  (isEdge ? " is-edge" : "") +
                                  (isAnchor ? " is-anchor" : "")
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => selectNormalRangeDay(index)}
                                />
                                <span>{label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {form.taskType === "recurring" && (
                      <div className="week-repeat-block">
                        <div className="week-repeat-title">
                          Повторять по дням недели
                        </div>

                        <div className="week-repeat-days">
                          {WEEK_DAY_LABELS.map(
                            (label, index) => (
                              <label
                                key={index}
                                className={
                                  "week-repeat-day" +
                                  (form.repeatDays.includes(index)
                                    ? " is-selected"
                                    : "")
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={form.repeatDays.includes(index)}
                                  onChange={() => toggleRepeatDay(index)}
                                />
                                <span>{label}</span>
                              </label>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {form.taskType === "volume" && (
                      <div className="week-volume-block">
                        <label>
                          Объём задачи
                          <input
                            type="number"
                            min="1"
                            value={form.volumeValue}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                volumeValue: e.target.value,
                              }))
                            }
                            placeholder="Например, 10"
                          />
                        </label>
                      </div>
                    )}

                    <div className="subtasks-form-block">
                      <div className="subtasks-form-title">Подзадачи</div>

                      <div className="subtasks-form-input-row">
                        <input
                          type="text"
                          placeholder="Новая подзадача"
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              addSubtaskToForm(e);
                            }
                          }}
                        />

                        <button
                          type="button"
                          onClick={(e) => addSubtaskToForm(e)}
                        >
                          +
                        </button>
                      </div>

                      {form.subtasks.length > 0 && (
                        <ul className="subtasks-form-list">
                          {form.subtasks.map((s) => (
                            <li key={s.id}>
                              <span className="subtasks-form-text">
                                {s.title}
                              </span>
                              <button
                                type="button"
                                className="subtasks-form-remove"
                                onClick={() => removeSubtaskFromForm(s.id)}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="modal-buttons">
                      <button type="submit" className="week-add-btn">
                        Сохранить
                      </button>

                      <button
                        type="button"
                        className="modal-cancel-btn"
                        onClick={closeModal}
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {isSaveTemplateOpen && (
              <div className="modal-overlay" onClick={closeSaveTemplateModal}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Новый шаблон недели</h3>

                  <div className="template-name-row">
                    <span className="template-name-label">Название:</span>
                    <input
                      type="text"
                      className="template-name-input"
                      placeholder="Например, Учёба + спорт + дом"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                  </div>

                  <label>
                    Цвет
                    <input
                      type="color"
                      value={templateColor}
                      onChange={(e) => setTemplateColor(e.target.value)}
                    />
                  </label>

                  <div className="modal-buttons">
                    <button
                      type="button"
                      className="week-add-btn"
                      onClick={saveWeekTemplateHandler}
                    >
                      Сохранить
                    </button>

                    <button
                      type="button"
                      className="modal-cancel-btn"
                      onClick={closeSaveTemplateModal}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isApplyTemplateOpen && (
              <div
                className="modal-overlay"
                onClick={() => setIsApplyTemplateOpen(false)}
              >
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h3>Выбери шаблон недели</h3>

                  <ul className="templates-list">
                    {templates.map((tpl) => (
                      <li key={tpl.id} className="template-item">
                        <span
                          className="template-color-dot"
                          style={{ backgroundColor: tpl.color }}
                        />
                        <span className="template-name">{tpl.name}</span>

                        <div className="template-actions">
                          <button
                            type="button"
                            className="primary-btn"
                            onClick={() => applyWeekTemplateHandler(tpl.id)}
                          >
                            Импорт
                          </button>

                          <button
                            type="button"
                            className="template-delete-btn"
                            onClick={() => deleteWeekTemplateHandler(tpl)}
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {templates.length === 0 && (
                    <div className="day-task-empty">
                      Сохрани шаблон недели и используй его для похожих планов
                    </div>
                  )}
                </div>
              </div>
            )}

            {isWeekGoalsOpen && (
              <div
                className="modal-overlay"
                onClick={() => setIsWeekGoalsOpen(false)}
              >
                <div
                  className="modal week-goals-modal"
                  onClick={(e) => e.stopPropagation()}
                >
                  <WeekGoalsPanel
                    weekStart={formatLocalDate(weekStart)}
                    className="week-goals-panel week-goals-panel--modal"
                  />
                </div>
              </div>
            )}

            {isCategoryManagerOpen && (
              <CategoryManagerModal
                categories={categories}
                onClose={() => setIsCategoryManagerOpen(false)}
                onCategoriesChanged={reloadCategories}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default WeekPlannerPage;
