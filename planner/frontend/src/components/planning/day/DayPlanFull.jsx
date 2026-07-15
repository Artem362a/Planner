import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  fetchDayTasks,
  createDayTask,
  updateDayTask,
  deleteDayTask,
  fetchDayTemplates,
  createDayTemplate,
  applyDayTemplate,
  reorderDayTasks,
  fetchDaySettings,
  saveDaySettings,
  deleteDayTemplate,
  fetchCategories,
  fetchWeekImportCandidates,
  importWeekTasksToDay,
  updateDayTemplate,
  fetchDayNote,
  saveDayNote,
} from "../../../api/tasks";
import PrioritySelect from "../../forms/PrioritySelect";
import CategorySelect from "../../forms/CategorySelect";
import CategoryManagerModal from "../../categories/CategoryManagerModal";
import { CategoryIcon } from "../../icons";

import DayGoalsPanel from "../../goals/DayGoalsPanel";

const PRIORITIES = [
  { value: "high", label: "Важный" },
  { value: "medium", label: "Обычный" },
];

const TEMPLATE_COLORS = [
  "#9B7BE8", "#7C67D8", "#5A6FD1", "#6F8EDB", "#7EA7F2", "#4FA3E0",
  "#67C5D8", "#48B8B0", "#5FD6C0", "#3FAE8C", "#72C99F", "#63B85E",
  "#8BCB6F", "#A0B455", "#B9C86A", "#D5C65F", "#E5B84E", "#F0B36A",
  "#E68A4F", "#E99A6D", "#E06A5E", "#F1848E", "#C95576", "#E36F9E",
  "#D985C7", "#B064C9", "#B97AD6", "#A6A2D8", "#7E88A8", "#95A0BF",
];

// Category tints that read fine on white are invisible on dark surfaces —
// timeline blocks bump their alphas when the dark theme is active.
function isDarkTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function hexToRgba(hex, alpha = 0.14) {
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

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortWeekdayDate(dateStr) {
  const d = new Date(dateStr);

  return d.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatImportCandidateDate(item) {
  if (!item.start_date || !item.end_date) {
    return formatShortWeekdayDate(item.import_day);
  }

  if (item.start_date === item.end_date) {
    return formatShortWeekdayDate(item.start_date);
  }

  return `${formatShortWeekdayDate(item.start_date)} – ${formatShortWeekdayDate(
    item.end_date
  )}`;
}

function minutesToDurationString(minutes) {
  if (minutes == null || Number.isNaN(Number(minutes))) return "";
  const total = Math.max(0, Number(minutes));
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function durationStringToMinutes(value) {
  if (!value || !value.trim()) return null;

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function addMinutesToTime(timeStr, minutesToAdd) {
  const [hh, mm] = timeStr.split(":").map(Number);
  const base = hh * 60 + mm + (minutesToAdd || 0);
  const total = Math.max(base, 0);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hh, mm] = timeStr.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
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

function BellIcon({ size = 16, strokeWidth = 2, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function DayPlanFull({ selectedDate, onTemplateModeChange, user }) {
  // Дефолт «напомнить за N минут» из настроек аккаунта.
  const defaultRemindLead = user?.task_reminder_lead_min ?? 10;
  const [tasks, setTasks] = useState([]);
  const [viewMode, setViewMode] = useState("timeline");
  // Режим «🔔»: на задачах с временем показываются свичи напоминаний.
  const [remindMode, setRemindMode] = useState(false);
  const [dayNotes, setDayNotes] = useState("");
  const [expandedTimelineGroupId, setExpandedTimelineGroupId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [swapTick, setSwapTick] = useState(0);
  const dragIndexRef = useRef(null);
  const dragHoverTimerRef = useRef(null);
  const dragHoverTargetRef = useRef(null);
  const [dayStartTime, setDayStartTime] = useState("06:00");

  const [editingTaskId, setEditingTaskId] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [insertBeforeId, setInsertBeforeId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    duration: "",
    priority: "medium",
    category: "home",
    subtasks: [],
    start_time: "",
    end_time: "",
    remind: false,
    remind_lead: 10,
  });

  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [inlineSubtaskTitles, setInlineSubtaskTitles] = useState({});

  const [categories, setCategories] = useState({});
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [isApplyTemplateOpen, setIsApplyTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState("");
  const [templateColor, setTemplateColor] = useState("#9B7BE8");
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [editingTemplateColor, setEditingTemplateColor] = useState("#9B7BE8");
  const [applyTemplateError, setApplyTemplateError] = useState("");
  // Подтверждение, когда применение шаблона уводит расписание за полночь.
  const [templateOverflowConfirm, setTemplateOverflowConfirm] = useState(null);

  // Режим редактирования шаблона прямо в интерфейсе плана дня.
  const [editingTemplate, setEditingTemplate] = useState(null);
  const isTemplateMode = !!editingTemplate;
  // Сохранять ли начало дня в шаблон (галочка в режиме редактирования).
  const [templateSaveDayStart, setTemplateSaveDayStart] = useState(false);
  // Счётчик синтетических id для локальных задач шаблона (отрицательные, чтобы
  // не пересекаться с серверными).
  const templateTaskIdRef = useRef(-1);

  const [hoveredTaskId, setHoveredTaskId] = useState(null);
  const [hoverInsertSide, setHoverInsertSide] = useState(null);

  const [isImportWeekOpen, setIsImportWeekOpen] = useState(false);
  const [weekImportCandidates, setWeekImportCandidates] = useState([]);
  const [selectedImportItems, setSelectedImportItems] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [timelineSubtaskTaskId, setTimelineSubtaskTaskId] = useState(null);

  const [conflictState, setConflictState] = useState(null);
  const [formError, setFormError] = useState(null);
  const [timeMode, setTimeMode] = useState("duration");
  // Защита от двойного сабмита: при плохом соединении пользователь жмёт
  // «Добавить» несколько раз и создаёт дубликаты задач.
  const [isSaving, setIsSaving] = useState(false);
  // Тик раз в минуту — двигает линию «сейчас» на таймлайне без перезагрузки.
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  const dayString = formatLocalDate(selectedDate);
  const notesSaveTimerRef = useRef(null);

  const taskItemRefs = useRef(new Map());
  const previousTaskRectsRef = useRef(new Map());
  const previousTaskOrderRef = useRef([]);

  const setTaskItemRef = (taskId) => (el) => {
    if (el) {
      taskItemRefs.current.set(taskId, el);
    } else {
      taskItemRefs.current.delete(taskId);
    }
  };

  useEffect(() => {
    fetchCategories()
      .then((items) => {
        setCategories(categoriesArrayToMap(items));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (isTemplateMode) return; // в режиме шаблона задачи засеяны локально
    previousTaskRectsRef.current = new Map();
    previousTaskOrderRef.current = [];
    fetchDayTasks(dayString).then(setTasks).catch(console.error);
  }, [dayString, isTemplateMode]);

  // Вернулись на вкладку — подтягиваем свежие задачи (могли добавиться,
  // например, через Telegram-бота). Не дёргаем во время редактирования.
  useEffect(() => {
    if (isTemplateMode) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (isModalOpen || dragIndex !== null) return;
      fetchDayTasks(dayString).then(setTasks).catch(console.error);
      setCurrentTime(new Date());
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [dayString, isTemplateMode, isModalOpen, dragIndex]);

  useLayoutEffect(() => {
    const currentOrder = tasks.map((t) => t.id);
    const prevOrder = previousTaskOrderRef.current;
    const orderChanged =
      prevOrder.length === currentOrder.length &&
      prevOrder.some((id, i) => id !== currentOrder[i]);

    const newRects = new Map();
    taskItemRefs.current.forEach((el, id) => {
      newRects.set(id, el.getBoundingClientRect());
    });

    if (orderChanged) {
      const draggedTaskId =
        dragIndex !== null && tasks[dragIndex] ? tasks[dragIndex].id : null;

      newRects.forEach((nextRect, id) => {
        if (id === draggedTaskId) return;

        const prevRect = previousTaskRectsRef.current.get(id);
        if (!prevRect) return;

        const dy = prevRect.top - nextRect.top;
        if (Math.abs(dy) < 1) return;

        const el = taskItemRefs.current.get(id);
        if (!el) return;

        el.animate(
          [
            { transform: `translateY(${dy}px)` },
            { transform: "translateY(0)" },
          ],
          {
            duration: 220,
            easing: "cubic-bezier(0.34, 1.3, 0.64, 1)",
          }
        );
      });
    }

    previousTaskRectsRef.current = newRects;
    previousTaskOrderRef.current = currentOrder;
  }, [tasks, dragIndex]);

  useEffect(() => {
    if (isTemplateMode) return;
    fetchDaySettings(dayString)
      .then((data) => {
        if (data?.start_time) {
          setDayStartTime(data.start_time);
        } else {
          setDayStartTime("06:00");
        }
      })
      .catch((err) => {
        console.error(err);
        setDayStartTime("06:00");
      });
  }, [dayString]);

  useEffect(() => {
    if (isTemplateMode) return;
    fetchDayNote(dayString)
      .then((data) => setDayNotes(data.text || ""))
      .catch(() => setDayNotes(""));
  }, [dayString, isTemplateMode]);

  // ===== Режим редактирования шаблона: вход/выход/сохранение + локальные CRUD =====
  const mapTemplateTaskToDay = (t, i) => ({
    id: templateTaskIdRef.current--,
    title: t.title || "",
    start_time: t.start_time || null,
    duration_min: t.duration_min ?? null,
    priority: t.priority || "medium",
    category: t.category ?? null,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    status: 0,
    order_index: i,
  });

  const enterTemplateEdit = (tpl) => {
    templateTaskIdRef.current = -1;
    setEditingTemplate(tpl);
    setEditingTemplateName(tpl.name || "");
    setEditingTemplateColor(tpl.color || TEMPLATE_COLORS[0]);
    setTasks((tpl.tasks || []).map(mapTemplateTaskToDay));
    setViewMode("list");
    setIsApplyTemplateOpen(false);
    setExpandedTaskId(null);
    setDayStartTime(tpl.day_start || "06:00");
    setTemplateSaveDayStart(!!tpl.day_start);
    onTemplateModeChange?.(tpl);
  };

  const exitTemplateEdit = () => {
    setEditingTemplate(null);
    onTemplateModeChange?.(null);
    // вернуть реальный день
    fetchDayTasks(dayString).then(setTasks).catch(console.error);
    fetchDaySettings(dayString)
      .then((data) => setDayStartTime(data?.start_time || "06:00"))
      .catch(() => setDayStartTime("06:00"));
    fetchDayNote(dayString)
      .then((d) => setDayNotes(d.text || ""))
      .catch(() => setDayNotes(""));
  };

  const saveTemplateEdit = async () => {
    if (!editingTemplate) return;
    const cleaned = tasks.map((t) => ({
      title: t.title || "",
      start_time: t.start_time ? t.start_time.slice(0, 5) : null,
      duration_min: t.duration_min ?? null,
      priority: t.priority || "medium",
      category: t.category ?? null,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    }));
    const name = editingTemplateName.trim();
    if (!name) return;
    try {
      const updated = await updateDayTemplate(editingTemplate.id, {
        name,
        color: editingTemplateColor,
        tasks: cleaned,
        // Пустая строка очищает day_start на бэке — шаблон перестаёт
        // трогать начало дня при импорте.
        day_start:
          templateSaveDayStart && dayStartTime ? dayStartTime.slice(0, 5) : "",
      });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      exitTemplateEdit();
    } catch (e) {
      console.error(e);
    }
  };

  // CRUD, ветвящиеся по режиму: в шаблоне работаем с локальным массивом.
  const persistCreate = async (body) => {
    if (!isTemplateMode) return await createDayTask(dayString, body);
    return {
      id: templateTaskIdRef.current--,
      status: 0,
      order_index: tasks.length,
      subtasks: [],
      ...body,
    };
  };
  const persistUpdate = async (id, body) => {
    if (!isTemplateMode) return await updateDayTask(dayString, id, body);
    const existing = tasks.find((t) => t.id === id) || {};
    return { ...existing, ...body, id };
  };
  const persistDelete = async (id) => {
    if (!isTemplateMode) return await deleteDayTask(dayString, id);
    return { ok: true };
  };
  const persistReorder = async (ids) => {
    if (!isTemplateMode) return await reorderDayTasks(dayString, ids);
    return { ok: true };
  };

  const upcomingImportCandidates = useMemo(
  () => weekImportCandidates.filter((item) => !item.is_overdue),
  [weekImportCandidates]
);

const overdueImportCandidates = useMemo(
  () => weekImportCandidates.filter((item) => item.is_overdue),
  [weekImportCandidates]
);

  const tasksWithComputedTime = useMemo(() => {
    let offset = 0;
    // Максимальный конец среди всех предыдущих задач — по нему ловим наложения,
    // когда задача с фиксированным временем стартует раньше, чем что-то уже идёт.
    let maxPrevEndMin = null;
    const dayStartMinutes = timeStringToMinutes(dayStartTime);

    return tasks.map((t) => {
      const duration = t.duration_min || 0;

      if (t.start_time) {
        offset = timeStringToMinutes(t.start_time) - dayStartMinutes;
      }

      const start = addMinutesToTime(dayStartTime, offset);
      const end = addMinutesToTime(start, duration);
      const timelineStart = dayStartMinutes + offset;
      const timelineEnd = timelineStart + duration;

      // Конфликт: фиксированная задача начинается раньше, чем закончилась
      // предыдущая (например, после смены начала дня якорь «уехал» внутрь
      // соседней задачи). Время не трогаем — только помечаем.
      const hasTimeConflict =
        !!t.start_time &&
        maxPrevEndMin !== null &&
        timelineStart < maxPrevEndMin;

      const result = {
        ...t,
        computed_start_time: start,
        computed_end_time: end,
        timeline_start_min: timelineStart,
        timeline_end_min: timelineEnd,
        has_time_conflict: hasTimeConflict,
      };

      offset += duration;
      maxPrevEndMin =
        maxPrevEndMin === null ? timelineEnd : Math.max(maxPrevEndMin, timelineEnd);
      return result;
    });
  }, [tasks, dayStartTime]);

  const timelineHours = useMemo(() => {
    const dayStartMinutes = timeStringToMinutes(dayStartTime);
    // Start hour labels at the first full hour at or after dayStart — no empty pre-day space
    const start = Math.ceil(dayStartMinutes / 60) * 60;
    const lastEnd = tasksWithComputedTime.reduce(
      (max, task) => Math.max(max, task.timeline_end_min || dayStartMinutes),
      dayStartMinutes
    );
    const end = Math.max(23 * 60, Math.ceil(lastEnd / 60) * 60);
    const hours = [];

    for (let minute = start; minute <= end; minute += 60) {
      hours.push(minute);
    }

    return hours;
  }, [dayStartTime, tasksWithComputedTime]);

  const timelineStartMinute = timeStringToMinutes(dayStartTime);
  const timelineEndMinute =
    timelineHours[timelineHours.length - 1] || timelineStartMinute + 60;
  const timelineHourHeight = 88;
  const timelineMinTaskHeight = 48;
  const timelineSmallTaskMinutes = 20;
  const timelineStandaloneSmallGroupSize = 3;
  const timelineSmallGroupBaseHeight = 60;
  const timelineSmallGroupRowHeight = 30;
  const timelineSmallGroupExpandedPadding = 34;
  const timelineSmallGroupMaxListHeight = 260;
  const timelineMaxAttachGapMin = 30;
  const getSmallGroupId = (run) => `small-${run[0].id}-${run[run.length - 1].id}`;
  const getSmallGroupHeight = (run) => {
    const id = getSmallGroupId(run);

    if (expandedTimelineGroupId !== id) {
      return timelineSmallGroupBaseHeight;
    }

    return (
      timelineSmallGroupBaseHeight +
      Math.min(
        timelineSmallGroupMaxListHeight,
        timelineSmallGroupExpandedPadding + run.length * timelineSmallGroupRowHeight
      )
    );
  };
  const timelinePxPerMinute = timelineHourHeight / 60;

  const timelineScale = useMemo(() => {
    const points = [{ minute: timelineStartMinute, y: 0 }];
    let currentMinute = timelineStartMinute;
    let currentY = 0;

    const pushPoint = (minute, y) => {
      const last = points[points.length - 1];

      if (last && last.minute === minute) {
        last.y = Math.max(last.y, y);
        return;
      }

      points.push({ minute, y });
    };

    const isSmallTask = (task) =>
      (task.duration_min || 0) <= timelineSmallTaskMinutes;

    for (let index = 0; index < tasksWithComputedTime.length; index += 1) {
      const task = tasksWithComputedTime[index];
      const start = task.timeline_start_min;

      if (isSmallTask(task)) {
        const run = [task];
        let cursor = index + 1;

        while (
          cursor < tasksWithComputedTime.length &&
          isSmallTask(tasksWithComputedTime[cursor])
        ) {
          run.push(tasksWithComputedTime[cursor]);
          cursor += 1;
        }

        if (run.length >= timelineStandaloneSmallGroupSize) {
          const groupEnd = Math.max(
            run[run.length - 1].timeline_end_min,
            start + 1
          );

          if (start > currentMinute) {
            currentY += (start - currentMinute) * timelinePxPerMinute;
            currentMinute = start;
            pushPoint(currentMinute, currentY);
          }

          currentY += getSmallGroupHeight(run);
          currentMinute = groupEnd;
          pushPoint(currentMinute, currentY);
          index = cursor - 1;
          continue;
        }
      }

      const end = Math.max(task.timeline_end_min, start + 1);

      if (start > currentMinute) {
        currentY += (start - currentMinute) * timelinePxPerMinute;
        currentMinute = start;
        pushPoint(currentMinute, currentY);
      }

      const naturalHeight = (end - start) * timelinePxPerMinute;
      const visualHeight = Math.max(naturalHeight, timelineMinTaskHeight);
      currentY += visualHeight;
      currentMinute = end;
      pushPoint(currentMinute, currentY);
    }

    if (timelineEndMinute > currentMinute) {
      currentY += (timelineEndMinute - currentMinute) * timelinePxPerMinute;
      currentMinute = timelineEndMinute;
      pushPoint(currentMinute, currentY);
    }

    return {
      points,
      height: Math.max(timelineHourHeight, currentY),
    };
  }, [
    tasksWithComputedTime,
    timelineStartMinute,
    timelineEndMinute,
    timelinePxPerMinute,
    timelineMinTaskHeight,
    timelineHourHeight,
    timelineSmallTaskMinutes,
    timelineStandaloneSmallGroupSize,
    timelineSmallGroupBaseHeight,
    timelineSmallGroupRowHeight,
    timelineSmallGroupExpandedPadding,
    timelineSmallGroupMaxListHeight,
    expandedTimelineGroupId,
  ]);

  const timelineHeight = timelineScale.height;
  const minuteToTimelineY = (minute) => {
    const points = timelineScale.points;

    if (minute <= points[0].minute) return points[0].y;

    for (let index = 1; index < points.length; index += 1) {
      const prev = points[index - 1];
      const next = points[index];

      if (minute <= next.minute) {
        const duration = Math.max(1, next.minute - prev.minute);
        const progress = (minute - prev.minute) / duration;
        return prev.y + (next.y - prev.y) * progress;
      }
    }

    return points[points.length - 1].y;
  };

  // Линия «сейчас» на таймлайне: только для сегодняшнего дня и только когда
  // текущее время попадает в диапазон таймлайна.
  const timelineNowMarker = (() => {
    if (isTemplateMode) return null;
    if (dayString !== formatLocalDate(currentTime)) return null;

    const nowMinute = currentTime.getHours() * 60 + currentTime.getMinutes();
    if (nowMinute < timelineStartMinute || nowMinute > timelineEndMinute) {
      return null;
    }

    const top = Math.min(timelineHeight, Math.max(0, minuteToTimelineY(nowMinute)));
    return {
      top,
      label: currentTime.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  })();

  const timelineTaskLayouts = useMemo(() => {
    const result = [];
    const pendingBefore = new Map();

    const isSmallTask = (task) =>
      (task.duration_min || 0) <= timelineSmallTaskMinutes;

    const makeSmallGroup = (run) => ({
      type: "attached-group",
      id: getSmallGroupId(run),
      tasks: run,
      title: "Небольшие задачи",
      computed_start_time: run[0].computed_start_time,
      computed_end_time: run[run.length - 1].computed_end_time,
      timeline_start_min: run[0].timeline_start_min,
      timeline_end_min: run[run.length - 1].timeline_end_min,
    });

    const getStart = (item) => item.timeline_start_min;
    const getEnd = (item) => item.timeline_end_min;

    const buildTaskLayout = (task, before = [], after = []) => {
      const start = Math.min(
        task.timeline_start_min,
        ...before.map(getStart),
        ...after.map(getStart)
      );
      const end = Math.max(
        task.timeline_end_min,
        ...before.map(getEnd),
        ...after.map(getEnd)
      );
      const naturalHeight = minuteToTimelineY(end) - minuteToTimelineY(start);

      return {
        type: "task",
        task,
        before,
        after,
        top: minuteToTimelineY(start),
        height: Math.max(
          naturalHeight,
          timelineMinTaskHeight + (before.length + after.length) * 24
        ),
      };
    };

    for (let index = 0; index < tasksWithComputedTime.length; index += 1) {
      const task = tasksWithComputedTime[index];

      if (!isSmallTask(task)) {
        result.push(buildTaskLayout(task, pendingBefore.get(task.id) || []));
        pendingBefore.delete(task.id);
        continue;
      }

      const run = [task];
      let cursor = index + 1;

      while (
        cursor < tasksWithComputedTime.length &&
        isSmallTask(tasksWithComputedTime[cursor])
      ) {
        run.push(tasksWithComputedTime[cursor]);
        cursor += 1;
      }

      const nextTask = tasksWithComputedTime[cursor];
      const previousLayout = result[result.length - 1];

      if (run.length === 1) {
        const gapToNext = nextTask
          ? nextTask.timeline_start_min - task.timeline_end_min
          : Infinity;
        if (nextTask && !isSmallTask(nextTask) && gapToNext <= timelineMaxAttachGapMin) {
          pendingBefore.set(nextTask.id, [
            ...(pendingBefore.get(nextTask.id) || []),
            task,
          ]);
        } else if (previousLayout?.type === "task") {
          previousLayout.after.push(task);
          const end = Math.max(
            previousLayout.task.timeline_end_min,
            ...previousLayout.before.map(getEnd),
            ...previousLayout.after.map(getEnd)
          );
          const start = Math.min(
            previousLayout.task.timeline_start_min,
            ...previousLayout.before.map(getStart),
            ...previousLayout.after.map(getStart)
          );
          previousLayout.height = Math.max(
            minuteToTimelineY(end) - minuteToTimelineY(start),
            timelineMinTaskHeight +
              (previousLayout.before.length + previousLayout.after.length) * 24
          );
        } else {
          result.push(buildTaskLayout(task));
        }
      } else {
        const group = makeSmallGroup(run);

        if (run.length >= timelineStandaloneSmallGroupSize) {
          result.push({
            type: "group",
            id: group.id,
            tasks: run,
            top: minuteToTimelineY(group.timeline_start_min),
            height: getSmallGroupHeight(run),
            startTime: group.computed_start_time,
            endTime: group.computed_end_time,
          });
        } else if (nextTask && !isSmallTask(nextTask) &&
          nextTask.timeline_start_min - group.timeline_end_min <= timelineMaxAttachGapMin) {
          pendingBefore.set(nextTask.id, [
            ...(pendingBefore.get(nextTask.id) || []),
            group,
          ]);
        } else if (previousLayout?.type === "task") {
          previousLayout.after.push(group);
          const end = Math.max(
            previousLayout.task.timeline_end_min,
            ...previousLayout.before.map(getEnd),
            ...previousLayout.after.map(getEnd)
          );
          const start = Math.min(
            previousLayout.task.timeline_start_min,
            ...previousLayout.before.map(getStart),
            ...previousLayout.after.map(getStart)
          );
          previousLayout.height = Math.max(
            minuteToTimelineY(end) - minuteToTimelineY(start),
            timelineMinTaskHeight +
              (previousLayout.before.length + previousLayout.after.length) * 24
          );
        } else {
          result.push({
            type: "group",
            id: group.id,
            tasks: run,
            top: minuteToTimelineY(group.timeline_start_min),
            height: getSmallGroupHeight(run),
            startTime: group.computed_start_time,
            endTime: group.computed_end_time,
          });
        }
      }

      index = cursor - 1;
    }

    return result;
  }, [tasksWithComputedTime, timelineStartMinute, timelineScale, expandedTimelineGroupId]);

  const saveDayNotes = (value) => {
    setDayNotes(value);
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    notesSaveTimerRef.current = setTimeout(() => {
      saveDayNote(dayString, value).catch(console.error);
    }, 800);
  };

  const buildTemplateFromTasks = () =>
    tasksWithComputedTime.map((t) => ({
      title: t.title,
      start_time: t.start_time ? t.start_time.slice(0, 5) : null,
      duration_min: t.duration_min,
      priority: t.priority,
      category: t.category,
      subtasks: t.subtasks || [],
    }));

  const reloadCategories = async () => {
    try {
      const items = await fetchCategories();
      setCategories(categoriesArrayToMap(items));
    } catch (e) {
      console.error(e);
    }
  };

  const openImportWeekModal = async () => {
    if (isTemplateMode) return; // импорт из недели недоступен при редактировании шаблона
    try {
      setImportLoading(true);
      const items = await fetchWeekImportCandidates(dayString, 2, 7);
      setWeekImportCandidates(items || []);
      setSelectedImportItems([]);
      setIsImportWeekOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setImportLoading(false);
    }
  };

  const closeImportWeekModal = () => {
    setIsImportWeekOpen(false);
    setWeekImportCandidates([]);
    setSelectedImportItems([]);
  };

  const makeImportKey = (item) => `${item.week_task_id}_${item.import_day}`;

  const toggleImportItem = (item) => {
    const key = makeImportKey(item);

    setSelectedImportItems((prev) =>
      prev.includes(key)
        ? prev.filter((x) => x !== key)
        : [...prev, key]
    );
  };

  const submitImportWeekTasks = async () => {
  const selectedItems = weekImportCandidates.filter((item) =>
    selectedImportItems.includes(makeImportKey(item))
  );

  if (selectedItems.length === 0) return;

  try {
    const created = await importWeekTasksToDay(
  dayString,
  selectedItems.map((item) => ({
    week_task_id: item.week_task_id,
    import_day: item.import_day,
    is_overdue: !!item.is_overdue,
  }))
);

    console.log("IMPORTED TASKS:", created);
    console.log("CURRENT DAY:", dayString);

    const updated = await fetchDayTasks(dayString);
    console.log("UPDATED DAY TASKS:", updated);

    setTasks(updated);
    closeImportWeekModal();
  } catch (e) {
    console.error(e);
  }
};



  useEffect(() => {
    const createHandler = () => openCreateModal(null);
    const importHandler = () => openImportWeekModal();

    window.addEventListener("open-day-create-task", createHandler);
    window.addEventListener("open-day-import-week", importHandler);

    return () => {
      window.removeEventListener("open-day-create-task", createHandler);
      window.removeEventListener("open-day-import-week", importHandler);
    };
  }, [dayString, categories]);

  const onDragStart = (e, index) => {
    dragIndexRef.current = index;
    setDragIndex(index);
    setHoveredTaskId(null);
    setHoverInsertSide(null);
    const card = e.currentTarget.closest(".day-task-item");
    if (card && e.dataTransfer) {
      const rect = card.getBoundingClientRect();
      e.dataTransfer.setDragImage(card, e.clientX - rect.left, e.clientY - rect.top);
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", String(index)); } catch (_) {}
    }
  };

  const cancelDragHoverTimer = () => {
    if (dragHoverTimerRef.current !== null) {
      clearTimeout(dragHoverTimerRef.current);
      dragHoverTimerRef.current = null;
    }
    dragHoverTargetRef.current = null;
    setHoveredTaskId(null);
    setHoverInsertSide(null);
  };

  const scheduleSwap = (index) => {
    dragHoverTargetRef.current = index;
    const target = tasks[index];
    if (target) setHoveredTaskId(target.id);
    setHoverInsertSide(null);
    dragHoverTimerRef.current = setTimeout(() => {
      const current = dragIndexRef.current;
      dragHoverTimerRef.current = null;
      dragHoverTargetRef.current = null;
      if (current === null || current === index) return;

      setTasks((prev) => {
        const copy = [...prev];
        const [moved] = copy.splice(current, 1);
        copy.splice(index, 0, moved);
        return copy.map((task, idx) => ({
          ...task,
          order_index: idx,
        }));
      });

      dragIndexRef.current = index;
      setDragIndex(index);
      setSwapTick((t) => t + 1);
      setHoveredTaskId(null);
    }, 40);
  };

  const onDragOver = (e, index) => {
    e.preventDefault();
    const current = dragIndexRef.current;
    if (current === null || current === index) {
      cancelDragHoverTimer();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (current < index && e.clientY < midY) {
      cancelDragHoverTimer();
      return;
    }
    if (current > index && e.clientY > midY) {
      cancelDragHoverTimer();
      return;
    }

    if (dragHoverTargetRef.current === index) return;

    cancelDragHoverTimer();
    scheduleSwap(index);
  };

  const onDragEnd = async () => {
    cancelDragHoverTimer();
    dragIndexRef.current = null;
    setDragIndex(null);

    try {
      const hasFixed = tasks.some((t) => t.start_time);
      if (hasFixed) {
        const sorted = sortTasksByTime(tasks);
        const changed = sorted.some((t, i) => t.id !== tasks[i].id);
        if (changed) {
          await persistReorder(sorted.map((t) => t.id));
          setTasks(sorted);
          return;
        }
      }
      await persistReorder(tasks.map((t) => t.id));
    } catch (err) {
      console.error(err);
    }
  };

  const touchStartPosRef = useRef(null);
  const touchPendingIndexRef = useRef(null);

  const onTouchStart = (e, index) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchPendingIndexRef.current = index;
  };

  const onTouchMove = (e) => {
    const startPos = touchStartPosRef.current;
    const pendingIndex = touchPendingIndexRef.current;
    if (startPos === null || pendingIndex === null) return;

    const touch = e.touches[0];
    if (!touch) return;

    let activeIndex = dragIndexRef.current;

    if (activeIndex === null) {
      const dx = touch.clientX - startPos.x;
      const dy = touch.clientY - startPos.y;
      if (Math.hypot(dx, dy) < 8) return;
      dragIndexRef.current = pendingIndex;
      setDragIndex(pendingIndex);
      activeIndex = pendingIndex;
    }

    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!target) {
      cancelDragHoverTimer();
      return;
    }

    const taskEl = target.closest("[data-task-index]");
    if (!taskEl) {
      cancelDragHoverTimer();
      return;
    }

    const overIndex = Number(taskEl.dataset.taskIndex);
    if (Number.isNaN(overIndex) || overIndex === activeIndex) {
      cancelDragHoverTimer();
      return;
    }

    const rect = taskEl.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (activeIndex < overIndex && touch.clientY < midY) {
      cancelDragHoverTimer();
      return;
    }
    if (activeIndex > overIndex && touch.clientY > midY) {
      cancelDragHoverTimer();
      return;
    }

    if (dragHoverTargetRef.current === overIndex) return;

    cancelDragHoverTimer();
    scheduleSwap(overIndex);
  };

  const onTouchEnd = () => {
    const wasDragging = dragIndexRef.current !== null;
    touchStartPosRef.current = null;
    touchPendingIndexRef.current = null;
    if (wasDragging) onDragEnd();
  };

  const openCreateModal = (beforeTaskId = null) => {
    setHoveredTaskId(null);
    setHoverInsertSide(null);

    setForm({
      title: "",
      duration: "",
      priority: "medium",
      category: categories.home ? "home" : Object.keys(categories)[0] || "",
      subtasks: [],
      start_time: "",
      end_time: "",
      remind: false,
      remind_lead: defaultRemindLead,
    });
    setTimeMode("duration");

    setNewSubtaskTitle("");
    setEditingTaskId(null);
    setInsertBeforeId(beforeTaskId);
    setIsModalOpen(true);
  };

  const openEditModal = (task) => {
    setHoveredTaskId(null);
    setHoverInsertSide(null);

    const hasRange = !!task.start_time;
    const startSliced = hasRange ? task.start_time.slice(0, 5) : "";
    const endTime = hasRange && task.duration_min
      ? addMinutesToTime(startSliced, task.duration_min)
      : "";

    setForm({
      title: task.title || "",
      duration: hasRange ? "" : minutesToDurationString(task.duration_min),
      priority: task.priority || "medium",
      category:
        task.category ||
        (categories.home ? "home" : Object.keys(categories)[0] || ""),
      subtasks: task.subtasks || [],
      start_time: startSliced,
      end_time: endTime,
      remind: task.remind_lead_min != null,
      remind_lead:
        task.remind_lead_min != null ? task.remind_lead_min : defaultRemindLead,
    });
    setTimeMode(hasRange ? "range" : "duration");

    setNewSubtaskTitle("");
    setEditingTaskId(task.id);
    setInsertBeforeId(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setHoveredTaskId(null);
    setHoverInsertSide(null);
    setIsModalOpen(false);
    setEditingTaskId(null);
    setInsertBeforeId(null);
    setFormError(null);
    setTimeMode("duration");
  };

  const handleTaskMouseMove = (e, taskId) => {
    if (dragIndexRef.current !== null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    const topZone = height * 0.2;
    const bottomZone = height * 0.8;

    setHoveredTaskId(taskId);

    if (y <= topZone) {
      setHoverInsertSide("top");
    } else if (y >= bottomZone) {
      setHoverInsertSide("bottom");
    } else {
      setHoverInsertSide(null);
    }
  };

  const handleTaskMouseLeave = (e) => {
    const next = e.relatedTarget;

    if (
      next &&
      next instanceof HTMLElement &&
      next.closest(".day-hover-insert")
    ) {
      return;
    }

    setHoveredTaskId(null);
    setHoverInsertSide(null);
  };

  const hideInsertHover = () => {
    setHoveredTaskId(null);
    setHoverInsertSide(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "start_time" || name === "end_time") setFormError(null);
  };

  const sortTasksByTime = (taskList) => {
    let offset = 0;
    const dayStartMinutes = timeStringToMinutes(dayStartTime);

    const withMin = taskList.map((t, i) => {
      if (t.start_time) {
        offset = timeStringToMinutes(t.start_time.slice(0, 5)) - dayStartMinutes;
      }
      const startMin = dayStartMinutes + offset;
      offset += t.duration_min || 0;
      return { task: t, startMin, idx: i };
    });

    return [...withMin]
      .sort((a, b) => {
        if (a.startMin !== b.startMin) return a.startMin - b.startMin;
        const aFixed = a.task.start_time ? 0 : 1;
        const bFixed = b.task.start_time ? 0 : 1;
        if (aFixed !== bFixed) return aFixed - bFixed;
        return a.idx - b.idx;
      })
      .map(({ task }) => task);
  };

  const doCreateOrUpdate = async (body, conflictTask, newFixedStart) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      let newTasks;

      if (editingTaskId === null) {
        const created = await persistCreate(body);

        if (insertBeforeId == null) {
          newTasks = [...tasks, created];
        } else {
          const index = tasks.findIndex((t) => t.id === insertBeforeId);
          const copy = [...tasks];
          copy.splice(index === -1 ? copy.length : index, 0, created);
          newTasks = copy;
        }

        if (conflictTask && newFixedStart) {
          const updatedConflict = await persistUpdate(conflictTask.id, {
            ...conflictTask,
            start_time: newFixedStart,
          });
          newTasks = newTasks.map((t) => (t.id === conflictTask.id ? updatedConflict : t));
        }
      } else {
        const updated = await persistUpdate(editingTaskId, body);
        newTasks = tasks.map((t) => (t.id === editingTaskId ? updated : t));
      }

      if (body.start_time) {
        const sorted = sortTasksByTime(newTasks);
        const changed = sorted.some((t, i) => t.id !== newTasks[i].id);
        if (changed) {
          await persistReorder(sorted.map((t) => t.id));
          newTasks = sorted;
        }
      }

      setTasks(newTasks);
      closeModal();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleForceSubmit = () => {
    if (!conflictState) return;
    const { body, conflictTask, newFixedStart } = conflictState;
    setConflictState(null);
    doCreateOrUpdate(body, conflictTask, newFixedStart);
  };

  // Применение шаблона. Если расписание (с учётом начала дня и уже
  // существующих задач) выходит за полночь — сначала предупреждаем и спрашиваем.
  const applyTemplateWithCheck = async (tpl, force = false) => {
    if (isSaving) return;
    const dayStartMin = timeStringToMinutes(dayStartTime);
    const tplDuration = (tpl.tasks || []).reduce(
      (sum, t) => sum + (t.duration_min || 0),
      0
    );
    const existingDuration = tasks.reduce(
      (sum, t) => sum + (t.duration_min || 0),
      0
    );

    // Бэк жёстко запрещает, когда суммарная длительность задач > 24ч —
    // такое в сутки не влезает в принципе. Показываем запрет сразу, без
    // бессмысленного «Применить».
    if (existingDuration + tplDuration > 1440) {
      setApplyTemplateError(
        "Суммарная длительность задач превышает 24 часа — шаблон не помещается в день."
      );
      setTemplateOverflowConfirm(null);
      return;
    }

    // По длительности влезает, но из-за позднего начала дня расписание
    // заходит за полночь — это бэк разрешает, поэтому спрашиваем подтверждение.
    const currentEndMin = tasksWithComputedTime.reduce(
      (max, t) => Math.max(max, t.timeline_end_min || dayStartMin),
      dayStartMin
    );
    const projectedEndMin = currentEndMin + tplDuration;

    if (!force && projectedEndMin > 1440) {
      setTemplateOverflowConfirm({
        tpl,
        endTime: addMinutesToTime("00:00", projectedEndMin % 1440),
      });
      return;
    }

    try {
      setIsSaving(true);
      setApplyTemplateError("");
      await applyDayTemplate(tpl.id, dayString);
      const updated = await fetchDayTasks(dayString);
      setTasks(updated);
      // Шаблон мог задать начало дня — подтянем актуальные настройки.
      if (tpl.day_start) {
        fetchDaySettings(dayString)
          .then((data) => setDayStartTime(data?.start_time || "06:00"))
          .catch(() => {});
      }
      setIsApplyTemplateOpen(false);
      setEditingTemplateId(null);
      setTemplateOverflowConfirm(null);
    } catch (e) {
      const msg = e?.message || "";
      setApplyTemplateError(
        msg.includes("24")
          ? "Суммарная длительность задач превышает 24 часа — шаблон не помещается в день."
          : "Не удалось применить шаблон."
      );
      setTemplateOverflowConfirm(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!form.title.trim()) return;

    let durationMin;
    let startTime;

    if (timeMode === "duration") {
      durationMin = durationStringToMinutes(form.duration);
      if (form.duration && durationMin === null) {
        setFormError("Введите длительность в формате ЧЧ:ММ, например 01:30");
        return;
      }
      startTime = "";
    } else {
      if (!form.start_time || !form.end_time) {
        setFormError("Укажите время начала и конца");
        return;
      }
      const startMin = timeStringToMinutes(form.start_time);
      const endMin = timeStringToMinutes(form.end_time);
      if (endMin <= startMin) {
        setFormError("Время окончания должно быть позже времени начала");
        return;
      }
      durationMin = endMin - startMin;
      startTime = form.start_time;
    }

    if (durationMin) {
      const currentTotal = tasks.reduce(
        (sum, t) => sum + (editingTaskId !== null && t.id === editingTaskId ? 0 : t.duration_min || 0),
        0
      );
      if (currentTotal + durationMin > 1440) {
        setFormError("День не может превышать 24 часа.");
        return;
      }
    }

    const body = {
      title: form.title,
      start_time: startTime,
      duration_min: durationMin,
      priority: form.priority,
      category: form.category,
      status: 0,
      subtasks: form.subtasks,
      insert_before_id: editingTaskId === null ? insertBeforeId : null,
      // -1 явно снимает напоминание (null бэкенд трактует как «не менять»).
      remind_lead_min: form.remind
        ? Math.max(0, Math.min(1440, Number(form.remind_lead) || 0))
        : -1,
    };

    // Без фиксированного времени (режим «Длительность») серверу нужен
    // якорь — текущее вычисленное время начала этой задачи в плане.
    if (form.remind && !startTime) {
      if (editingTaskId !== null) {
        const current = tasksWithComputedTime.find((t) => t.id === editingTaskId);
        body.remind_anchor_time = current ? current.computed_start_time : dayStartTime;
      } else if (insertBeforeId != null) {
        const insertIdx = tasksWithComputedTime.findIndex((t) => t.id === insertBeforeId);
        body.remind_anchor_time =
          insertIdx <= 0
            ? dayStartTime
            : tasksWithComputedTime[insertIdx - 1].computed_end_time;
      } else {
        const last = tasksWithComputedTime[tasksWithComputedTime.length - 1];
        body.remind_anchor_time = last ? last.computed_end_time : dayStartTime;
      }
    }

    if (startTime) {
      const newStart = timeStringToMinutes(startTime);
      const newEnd = newStart + (durationMin || 0);

      for (const t of tasksWithComputedTime) {
        if (!t.start_time) continue;
        if (editingTaskId !== null && t.id === editingTaskId) continue;

        const existStart = timeStringToMinutes(t.start_time);
        const existEnd = existStart + (t.duration_min || 0);
        const overlaps = newStart === existStart || (newStart < existEnd && existStart < newEnd);


        if (overlaps) {
          setFormError(
            `Нельзя создать задачу с временем начала ${startTime} — в это время уже есть задача «${t.title}»`
          );
          return;
        }
      }
    }

    if (editingTaskId === null && durationMin && insertBeforeId !== null) {
      const insertIdx = tasksWithComputedTime.findIndex((t) => t.id === insertBeforeId);
      if (insertIdx !== -1) {
        const taskBStartStr =
          insertIdx === 0
            ? dayStartTime
            : tasksWithComputedTime[insertIdx - 1].computed_end_time;
        const taskBEndMin = timeStringToMinutes(taskBStartStr) + durationMin;

        for (let j = insertIdx; j < tasksWithComputedTime.length; j++) {
          const ct = tasksWithComputedTime[j];
          if (ct.start_time) {
            const fixedMin = timeStringToMinutes(ct.start_time);
            if (taskBEndMin > fixedMin) {
              const newFixedStart = addMinutesToTime("00:00", taskBEndMin);
              setIsModalOpen(false);
              setConflictState({ body, conflictTask: ct, newFixedStart });
              return;
            }
            break;
          }
        }
      }
    }

    await doCreateOrUpdate(body, null, null);
  };

  const toggleTaskReminder = async (task) => {
    if (task.status === 1) return;
    // Вкл — с дефолтным N из настроек, выкл — «-1» снимает напоминание.
    const nextLead = task.remind_lead_min != null ? -1 : defaultRemindLead;
    const body = { ...task, remind_lead_min: nextLead };
    // Без фиксированного времени (режим «Длительность») серверу нужен
    // якорь — снимок текущего вычисленного времени начала задачи.
    if (!task.start_time) {
      body.remind_anchor_time = task.computed_start_time;
    }
    try {
      const updated = await persistUpdate(task.id, body);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      console.error(err);
    }
  };

  const cycleStatus = async (task) => {
    const nextStatus = task.status === 1 ? 0 : 1;

    try {
      const updated = await persistUpdate(task.id, {
        ...task,
        status: nextStatus,
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      console.error(err);
    }
  };

  const removeTask = async (task) => {
    try {
      await persistDelete(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      console.error(err);
    }
  };

  const addSubtaskToForm = () => {
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
  };

  const removeSubtaskFromForm = (id) => {
    setForm((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((s) => s.id !== id),
    }));
  };

  const setInlineTitle = (taskId, value) => {
    setInlineSubtaskTitles((prev) => ({ ...prev, [taskId]: value }));
  };

  const addSubtaskInline = async (task, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    const newSub = {
      id: Date.now(),
      title: trimmed,
      done: false,
    };

    const updatedTask = {
      ...task,
      subtasks: [...(task.subtasks || []), newSub],
    };

    try {
      const saved = await persistUpdate(task.id, updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch (e) {
      console.error(e);
    }
  };

  const removeSubtaskInline = async (task, subtaskId) => {
    const updatedTask = {
      ...task,
      subtasks: (task.subtasks || []).filter((s) => s.id !== subtaskId),
    };

    try {
      const saved = await persistUpdate(task.id, updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSubtask = async (task, subtask) => {
    const updatedSub = { ...subtask, done: !subtask.done };
    const updatedTask = {
      ...task,
      subtasks: (task.subtasks || []).map((s) =>
        s.id === subtask.id ? updatedSub : s
      ),
    };

    const allDone =
      updatedTask.subtasks.length > 0 &&
      updatedTask.subtasks.every((s) => s.done);

    if (allDone) {
      updatedTask.status = 1;
    }

    const anyNotDone = updatedTask.subtasks.some((s) => !s.done);

    if (anyNotDone) {
      updatedTask.status = 0;
    }

    try {
      const saved = await persistUpdate(task.id, updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleExpandedTask = (taskId) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const renderSmallTaskRow = (task) => {
    const isDone = task.status === 1;

    return (
      <div
        key={task.id}
        className={
          "day-timeline-attached-task day-timeline-attached-task--checkable" +
          (isDone ? " is-done" : "") +
          (remindMode && !isDone ? " remind-pickable" : "") +
          (remindMode && !isDone && task.remind_lead_min != null
            ? " remind-picked"
            : "")
        }
        onClick={(e) => {
          if (remindMode && !isDone) {
            e.stopPropagation();
            toggleTaskReminder(task);
          }
        }}
      >
        <label
          className="day-timeline-small-check"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isDone}
            onChange={() => cycleStatus(task)}
          />
          <span />
        </label>
        <span className="day-timeline-small-title">
          {task.title}
          {task.remind_lead_min != null && !isDone && (
            <span
              className="day-task-remind-ind"
              title={`Напоминание за ${task.remind_lead_min} мин до начала`}
            >
              <BellIcon size={11} strokeWidth={2.2} />
            </span>
          )}
        </span>
        <em>
          {task.computed_start_time}
          {task.duration_min ? ` – ${task.computed_end_time}` : ""}
        </em>
      </div>
    );
  };

  const renderTimelineAttachedItem = (item) => {
    if (item.type === "attached-group") {
      const isExpanded = expandedTimelineGroupId === item.id;

      return (
        <div key={item.id} className="day-timeline-attached-wrap">
          <button
            type="button"
            className="day-timeline-attached-task day-timeline-attached-task--button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedTimelineGroupId((prev) =>
                prev === item.id ? null : item.id
              );
            }}
          >
            <span>{item.title}</span>
            <em>
              {item.computed_start_time} – {item.computed_end_time}
            </em>
            <strong>{isExpanded ? "▲" : "▼"}</strong>
          </button>

          {isExpanded && (
            <div className="day-timeline-attached-list">
              {item.tasks.map(renderSmallTaskRow)}
            </div>
          )}
        </div>
      );
    }

    return renderSmallTaskRow(item);
  };

  const sidePanel = (
    <aside
      className={
        "day-side-panel" + (isTemplateMode ? " is-template-disabled" : "")
      }
    >
      <section className="day-side-section">
        <div className="day-side-title-row">
          <h3>Заметки дня</h3>
        </div>

        <textarea
          value={dayNotes}
          disabled={isTemplateMode}
          onChange={(e) => saveDayNotes(e.target.value)}
          placeholder="Мысли, итоги, важные детали..."
        />
      </section>

      <DayGoalsPanel selectedDay={dayString} />
    </aside>
  );

  return (
    <div className="day-tasks-page">
      <div className="day-tasks-wrapper">
        {isTemplateMode && (
          <div className="template-edit-banner">
            <div className="template-edit-banner-main">
              <span className="template-edit-banner-label">✎ Шаблон:</span>
              <input
                className="template-edit-banner-name"
                type="text"
                value={editingTemplateName}
                onChange={(e) => setEditingTemplateName(e.target.value)}
                placeholder="Название шаблона"
              />
              <div className="template-edit-banner-palette">
                {TEMPLATE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={
                      "category-color-swatch" +
                      (editingTemplateColor === color
                        ? " category-color-swatch--active"
                        : "")
                    }
                    style={{ "--swatch-color": color }}
                    onClick={() => setEditingTemplateColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div className="template-edit-banner-actions">
              <button
                type="button"
                className="primary-btn"
                disabled={!editingTemplateName.trim()}
                onClick={saveTemplateEdit}
              >
                Сохранить шаблон
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={exitTemplateEdit}
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        <div className="day-plan-toolbar">
          <div
            className={
              "day-templates-buttons" +
              (isTemplateMode ? " is-template-disabled" : "")
            }
          >
            <button
              type="button"
              className="secondary-btn"
              disabled={isTemplateMode}
              onClick={() => setIsSaveTemplateOpen(true)}
            >
              Сохранить как шаблон
            </button>

            <button
              type="button"
              className="secondary-btn"
              disabled={isTemplateMode}
              onClick={async () => {
                try {
                  const list = await fetchDayTemplates();
                  setTemplates(list);
                  setIsApplyTemplateOpen(true);
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              Применить шаблон
            </button>
          </div>

          <div className="day-toolbar-right">
            {!isTemplateMode && (
              <button
                type="button"
                className={
                  "day-remind-mode-btn" +
                  (remindMode ? " day-remind-mode-btn--active" : "")
                }
                title="Режим напоминаний: отметь задачи, о которых напомнить"
                aria-pressed={remindMode}
                onClick={() => setRemindMode((prev) => !prev)}
              >
                <BellIcon />
              </button>
            )}

            <div className="day-view-toggle" aria-label="Режим отображения">
              <button
                type="button"
                className={viewMode === "timeline" ? "active" : ""}
                onClick={() => setViewMode("timeline")}
              >
                Таймлайн
              </button>

              <button
                type="button"
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
              >
                Список
              </button>
            </div>
          </div>
        </div>

        {remindMode && !isTemplateMode && (
          <div className="day-remind-mode-hint">
            <BellIcon size={14} /> Нажимай на задачи, чтобы выделить их — бот и
            колокольчик напомнят за {defaultRemindLead} мин до начала. Своё
            время — в редактировании задачи.
          </div>
        )}

        <div className="day-start-bar">
          <span>Начало дня:</span>
          <input
            type="time"
            value={dayStartTime}
            disabled={isTemplateMode && !templateSaveDayStart}
            onChange={async (e) => {
              const value = e.target.value;
              setDayStartTime(value);

              // В режиме шаблона начало дня сохраняется вместе с шаблоном
              // (кнопка «Сохранить шаблон»), а не в настройки реального дня.
              if (isTemplateMode) return;

              try {
                await saveDaySettings(dayString, value);
              } catch (err) {
                console.error(err);
              }
            }}
          />
          {isTemplateMode && (
            <label className="day-start-tpl-check" title="При импорте шаблон установит это время начала дня">
              <input
                type="checkbox"
                checked={templateSaveDayStart}
                onChange={(e) => setTemplateSaveDayStart(e.target.checked)}
              />
              фиксировать в шаблоне
            </label>
          )}
        </div>

        {viewMode === "list" ? (
          <div className="day-timeline-layout">
          <ul className={"day-tasks-list" + (dragIndex !== null ? " day-tasks-list--dragging" : "")}>
            {tasksWithComputedTime.map((t, index) => {
            const nextTask = tasksWithComputedTime[index + 1];
            const isHovered = hoveredTaskId === t.id;

            return (
              <li key={t.id} className="day-task-hover-wrap">
                {!isModalOpen && isHovered && hoverInsertSide === "top" && (
                  <button
                    type="button"
                    className="day-hover-insert day-hover-insert--top"
                    onMouseEnter={() => {
                      setHoveredTaskId(t.id);
                      setHoverInsertSide("top");
                    }}
                    onClick={() => openCreateModal(t.id)}
                    aria-label="Добавить задачу перед этой"
                  >
                    +
                  </button>
                )}

                <div
                  ref={setTaskItemRef(t.id)}
                  className={
                    "day-task-item" +
                    (t.status === 1 ? " done" : "") +
                    (t.has_time_conflict ? " day-task-item--conflict" : "") +
                    (isHovered ? " day-task-item--hovered" : "") +
                    (index === dragIndex ? " day-task-item--dragging" : "") +
                    (remindMode && t.status !== 1 ? " remind-pickable" : "") +
                    (remindMode && t.status !== 1 && t.remind_lead_min != null
                      ? " remind-picked"
                      : "")
                  }
                  onClick={() => {
                    if (remindMode && t.status !== 1) toggleTaskReminder(t);
                  }}
                  style={{
                    "--task-list-tint": hexToRgba(
                      categories[t.category]?.color,
                      t.status === 1 ? 0.08 : 0.15
                    ),
                  }}
                  data-task-index={index}
                  onDragOver={(e) => onDragOver(e, index)}
                  onDragEnd={onDragEnd}
                  onMouseMove={(e) => handleTaskMouseMove(e, t.id)}
                  onMouseLeave={handleTaskMouseLeave}
                >
                  {index === dragIndex && (
                    <span key={swapTick} className="day-task-swap-flash" aria-hidden="true" />
                  )}
                  <div
                    className="day-task-drag-handle"
                    draggable
                    onDragStart={(e) => onDragStart(e, index)}
                    onMouseEnter={hideInsertHover}
                    onTouchStart={(e) => onTouchStart(e, index)}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchEnd}
                  >
                    ⋮⋮
                  </div>

                  <label className="day-task-checkbox">
                    <input
                      type="checkbox"
                      checked={t.status === 1}
                      onChange={() => cycleStatus(t)}
                    />
                    <span />
                  </label>

                  <div className="day-task-content">
                    <div className="day-task-title">{t.title}</div>

                    <div className="day-task-meta">
                      {t.has_time_conflict && (
                        <span
                          className="day-task-conflict-tag"
                          title="Время задачи пересекается с предыдущей. Сдвиньте начало или измените время вручную."
                        >
                          ⚠ наложение
                        </span>
                      )}

                      {t.duration_min != null && (
                        <span>{minutesToDurationString(t.duration_min)}</span>
                      )}

                      {t.priority && <span>[{t.priority}]</span>}

                      {t.category && (
                        <span>
                          #{categories[t.category]?.title || t.category}
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
                    </div>

                    {expandedTaskId === t.id && (
                      <div
                        className="subtasks-inline-block"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                            onChange={(e) =>
                              setInlineTitle(t.id, e.target.value)
                            }
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
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

                  {t.remind_lead_min != null && t.status !== 1 && (
                    <span
                      className="day-task-remind-ind"
                      title={`Напоминание за ${t.remind_lead_min} мин до начала`}
                    >
                      <BellIcon size={11} strokeWidth={2.2} />
                    </span>
                  )}

                  <div className={`day-task-time${t.start_time ? " day-task-time--fixed" : ""}`}>
                    {t.computed_start_time}
                    {t.duration_min ? `–${t.computed_end_time}` : null}
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
                      onClick={() => removeTask(t)}
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
                </div>

                {!isModalOpen && isHovered && hoverInsertSide === "bottom" && (
                  <button
                    type="button"
                    className="day-hover-insert day-hover-insert--bottom"
                    onMouseEnter={() => {
                      setHoveredTaskId(t.id);
                      setHoverInsertSide("bottom");
                    }}
                    onClick={() =>
                      openCreateModal(nextTask ? nextTask.id : null)
                    }
                    aria-label="Добавить задачу после этой"
                  >
                    +
                  </button>
                )}
              </li>
            );
            })}

            {tasksWithComputedTime.length === 0 && (
              <li className="day-task-empty">Пока нет задач на этот день</li>
            )}
          </ul>
          {sidePanel}
          </div>
        ) : (
          <div className="day-timeline-layout">
            <div
              className="day-timeline-board"
              style={{
                "--timeline-height": `${timelineHeight}px`,
              }}
            >
              <div className="day-timeline-hours">
                {timelineHours.map((minute) => (
                  <div
                    key={minute}
                    className="day-timeline-hour-label"
                    style={{ top: `${minuteToTimelineY(minute)}px` }}
                  >
                    {addMinutesToTime("00:00", minute)}
                  </div>
                ))}
              </div>

              <div className="day-timeline-track">
                {timelineNowMarker && (
                  <div
                    className="day-timeline-now-marker"
                    style={{ "--now-marker-top": `${timelineNowMarker.top}px` }}
                    title={`Сейчас ${timelineNowMarker.label}`}
                    aria-hidden="true"
                  >
                    <span className="day-timeline-now-line" />
                    <span className="day-timeline-now-dot" />
                  </div>
                )}

                {timelineHours.map((minute) => (
                  <div
                    key={minute}
                    className="day-timeline-grid-line"
                    style={{ top: `${minuteToTimelineY(minute)}px` }}
                  />
                ))}

                {timelineTaskLayouts.map((item) => {
                  if (item.type === "group") {
                    const groupAllDone =
                      item.tasks.length > 0 &&
                      item.tasks.every((t) => t.status === 1);
                    const color = groupAllDone
                      ? "#aaaaaa"
                      : categories[item.tasks[0]?.category]?.color || "#A6A2D8";
                    const isExpanded = expandedTimelineGroupId === item.id;

                    return (
                      <article
                        key={item.id}
                        className={`day-timeline-task day-timeline-task--small-group${
                          isExpanded ? " day-timeline-task--expanded" : ""
                        }${groupAllDone ? " day-timeline-task--done" : ""}`}
                        style={{
                          top: `${Math.max(0, item.top)}px`,
                          height: `${item.height}px`,
                          background: isDarkTheme()
                            ? hexToRgba(color, 0.14)
                            : `linear-gradient(90deg, ${hexToRgba(color, 0.18)} 0%, ${hexToRgba(color, 0.08)} 100%)`,
                          ...(isDarkTheme() && { borderColor: hexToRgba(color, 0.25) }),
                          borderLeftColor: color,
                        }}
                      >
                        <div
                          className="day-timeline-icon"
                          style={{
                            color,
                            backgroundColor: hexToRgba(color, 0.14),
                          }}
                        >
                          <CategoryIcon name="checklist" />
                        </div>

                        <button
                          type="button"
                          className="day-timeline-group-toggle"
                          onClick={() =>
                            setExpandedTimelineGroupId((prev) =>
                              prev === item.id ? null : item.id
                            )
                          }
                          aria-label="Показать короткие задачи"
                        >
                          {isExpanded ? "▲" : "▼"}
                        </button>

                        <div className="day-timeline-task-content">
                          <div className="day-timeline-title">
                            Небольшие задачи
                          </div>
                          <div className="day-timeline-time">
                            {item.tasks.length} задачи · {item.startTime} – {item.endTime}
                          </div>
                        </div>

                        <div className="day-timeline-group-list">
                            {item.tasks.map(renderSmallTaskRow)}
                        </div>
                      </article>
                    );
                  }

                  const { task, top, height, before, after } = item;
                  const color = categories[task.category]?.color || "#BBBBBB";
                  const isDone = task.status === 1;
                  const bgColor = isDone ? "#aaaaaa" : color;
                  const attachedTasks = [...before, ...after];
                  const isCompact =
                    attachedTasks.length === 0 && (task.duration_min || 0) <= 30;

                  return (
                    <article
                      key={task.id}
                      className={
                        "day-timeline-task" +
                        (isDone ? " day-timeline-task--done" : "") +
                        (task.has_time_conflict ? " day-timeline-task--conflict" : "") +
                        (attachedTasks.length > 0
                          ? " day-timeline-task--with-attached"
                          : "") +
                        (isCompact ? " day-timeline-task--compact" : "") +
                        (remindMode && !isDone ? " remind-pickable" : "") +
                        (remindMode && !isDone && task.remind_lead_min != null
                          ? " remind-picked"
                          : "")
                      }
                      style={{
                        top: `${Math.max(0, top)}px`,
                        height: `${height}px`,
                        background: isDarkTheme()
                          ? hexToRgba(bgColor, isDone ? 0.09 : 0.15)
                          : `linear-gradient(90deg, ${hexToRgba(bgColor, isDone ? 0.14 : 0.2)} 0%, ${hexToRgba(bgColor, isDone ? 0.07 : 0.1)} 100%)`,
                        ...(isDarkTheme() && {
                          borderColor: hexToRgba(bgColor, isDone ? 0.14 : 0.25),
                        }),
                        borderLeftColor: isDone ? "#aaaaaa" : color,
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        remindMode ? toggleTaskReminder(task) : cycleStatus(task)
                      }
                    >
                      <div
                        className="day-timeline-icon"
                        style={{ color: isDone ? "#aaaaaa" : color, backgroundColor: hexToRgba(bgColor, 0.14) }}
                      >
                        <CategoryIcon name={categories[task.category]?.icon || "tag"} />
                      </div>

                      <div className="day-timeline-task-content">
                        {before.map(renderTimelineAttachedItem)}

                        <div className="day-timeline-title">
                          {task.has_time_conflict && (
                            <span
                              className="day-timeline-conflict-mark"
                              title="Время задачи пересекается с предыдущей. Сдвиньте начало или измените время вручную."
                            >
                              ⚠
                            </span>
                          )}
                          {task.title}
                        </div>
                        <div className="day-timeline-time-row">
                          <span className="day-timeline-time">
                            {task.computed_start_time}
                            {task.duration_min ? ` – ${task.computed_end_time}` : ""}
                          </span>
                          {task.remind_lead_min != null && !isDone && (
                            <span
                              className="day-task-remind-ind"
                              title={`Напоминание за ${task.remind_lead_min} мин до начала`}
                            >
                              <BellIcon size={11} strokeWidth={2.2} />
                            </span>
                          )}
                          {task.subtasks?.length > 0 && (
                            <button
                              type="button"
                              className="day-timeline-subtask-badge"
                              title="Подзадачи"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTimelineSubtaskTaskId(task.id);
                              }}
                            >
                              {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
                            </button>
                          )}
                        </div>

                        {after.map(renderTimelineAttachedItem)}
                      </div>

                      <button
                        type="button"
                        className="day-timeline-menu"
                        aria-label="Редактировать задачу"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(task);
                        }}
                      >
                        ✎
                      </button>
                    </article>
                  );
                })}

                {tasksWithComputedTime.length === 0 && (
                  <div className="day-timeline-empty">
                    Пока нет задач на этот день
                  </div>
                )}
              </div>
            </div>

            {sidePanel}
          </div>
        )}
      </div>

      {timelineSubtaskTaskId && (() => {
        const stTask = tasksWithComputedTime.find(t => t.id === timelineSubtaskTaskId);
        if (!stTask) return null;
        return (
          <div className="task-modal-backdrop" onClick={() => setTimelineSubtaskTaskId(null)}>
            <div className="task-modal task-modal--subtasks" onClick={(e) => e.stopPropagation()}>
              <h3>{stTask.title}</h3>
              <ul className="subtasks-list">
                {stTask.subtasks.map((s) => (
                  <li key={s.id} className="subtask-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!s.done}
                        onChange={() => toggleSubtask(stTask, s)}
                      />
                      <span style={s.done ? { textDecoration: "line-through", color: "#aaa" } : {}}>
                        {s.title}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="secondary-btn"
                style={{ marginTop: 12 }}
                onClick={() => setTimelineSubtaskTaskId(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        );
      })()}

      {isModalOpen && (
        <div className="task-modal-backdrop">
          <div className="task-modal">
            <h3>
              {editingTaskId === null
                ? "Новая задача"
                : "Редактировать задачу"}
            </h3>

            <form onSubmit={handleSubmit} className="task-modal-form">
              <label>
                Название
                <input
                  name="title"
                  type="text"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="Что нужно сделать"
                />
              </label>

              <div className="time-mode-toggle">
                <button
                  type="button"
                  className={`time-mode-btn${timeMode === "duration" ? " time-mode-btn--active" : ""}`}
                  onClick={() => { setTimeMode("duration"); setFormError(null); }}
                >
                  Длительность
                </button>
                <button
                  type="button"
                  className={`time-mode-btn${timeMode === "range" ? " time-mode-btn--active" : ""}`}
                  onClick={() => { setTimeMode("range"); setFormError(null); }}
                >
                  Начало–Конец
                </button>
              </div>

              {timeMode === "duration" ? (
                <label>
                  Длительность (ЧЧ:ММ)
                  <input
                    name="duration"
                    type="text"
                    value={form.duration}
                    onChange={handleFormChange}
                    placeholder="01:30"
                    maxLength={5}
                  />
                </label>
              ) : (
                <div className="time-range-row">
                  <label>
                    Начало
                    <input
                      name="start_time"
                      type="time"
                      value={form.start_time}
                      onChange={handleFormChange}
                    />
                  </label>
                  <label>
                    Конец
                    <input
                      name="end_time"
                      type="time"
                      value={form.end_time}
                      onChange={handleFormChange}
                    />
                  </label>
                </div>
              )}

              {!isTemplateMode && (
                <div
                  className="task-remind-row"
                  title="Бот и колокольчик на сайте пришлют напоминание"
                >
                  <label className="task-remind-toggle">
                    <input
                      type="checkbox"
                      checked={form.remind}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, remind: e.target.checked }))
                      }
                    />
                    <span className="task-remind-slider" aria-hidden="true" />
                    <span className="task-remind-label">
                      <BellIcon size={14} strokeWidth={2} />
                      Напомнить
                    </span>
                  </label>

                  {form.remind && (
                    <span className="task-remind-lead-wrap">
                      за
                      <input
                        type="number"
                        className="task-remind-lead"
                        min={0}
                        max={1440}
                        value={form.remind_lead}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            remind_lead: e.target.value,
                          }))
                        }
                      />
                      мин
                    </span>
                  )}

                  {form.remind && timeMode === "duration" && (
                    <span className="task-remind-note">
                      без фикс. времени — по текущему месту в плане
                    </span>
                  )}
                </div>
              )}

              <label>
                Приоритет
                <PrioritySelect
                  value={form.priority}
                  onChange={(newPriority) =>
                    setForm((prev) => ({
                      ...prev,
                      priority: newPriority,
                    }))
                  }
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
                  dropUp={true}
                />
              </label>

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
                        e.preventDefault();
                        addSubtaskToForm();
                      }
                    }}
                  />
                  <button type="button" onClick={addSubtaskToForm}>
                    +
                  </button>
                </div>

                {form.subtasks.length > 0 && (
                  <ul className="subtasks-form-list">
                    {form.subtasks.map((s) => (
                      <li key={s.id}>
                        <span className="subtasks-form-text">{s.title}</span>
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

              {formError && (
                <p className="form-error-banner">{formError}</p>
              )}

              <div className="task-modal-buttons">
                <button type="submit" className="primary-btn" disabled={isSaving}>
                  {isSaving
                    ? "Сохраняю…"
                    : editingTaskId === null
                    ? "Добавить"
                    : "Сохранить"}
                </button>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={closeModal}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {conflictState && (
        <div className="task-modal-backdrop">
          <div className="task-modal">
            <h3>Конфликт времени</h3>
            <p className="conflict-modal-text">
              Задача <strong>«{conflictState.conflictTask.title}»</strong> зафиксирована на{" "}
              <strong>{conflictState.conflictTask.start_time.slice(0, 5)}</strong>. Новая задача займёт это
              время, и начало зафиксированной задачи сдвинется на{" "}
              <strong>{conflictState.newFixedStart}</strong>.
            </p>
            <div className="task-modal-buttons">
              <button type="button" className="primary-btn" onClick={handleForceSubmit}>
                Добавить (сдвинет задачу)
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => { setConflictState(null); setIsModalOpen(true); }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {isSaveTemplateOpen && (
        <div
          className="task-modal-backdrop"
          onClick={() => setIsSaveTemplateOpen(false)}
        >
          <div className="task-modal save-template-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="save-template-title">Сохранить шаблон</h3>

            <div className="save-template-field">
              <label className="save-template-label">Название</label>
              <input
                type="text"
                className="save-template-input"
                placeholder="Например, Учёба + спорт"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="save-template-field">
              <label className="save-template-label">Цвет</label>
              <div className="category-color-palette save-template-palette">
                {TEMPLATE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={"category-color-swatch" + (templateColor === color ? " category-color-swatch--active" : "")}
                    style={{ "--swatch-color": color }}
                    onClick={() => setTemplateColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <div className="task-modal-buttons">
              <button
                type="button"
                className="primary-btn"
                disabled={!templateName.trim()}
                onClick={async () => {
                  if (!templateName.trim()) return;

                  try {
                    await createDayTemplate({
                      name: templateName,
                      color: templateColor,
                      tasks: buildTemplateFromTasks(),
                    });
                    setIsSaveTemplateOpen(false);
                    setTemplateName("");
                    setTemplateColor("#9B7BE8");
                  } catch (e) {
                    console.error(e);
                  }
                }}
              >
                Сохранить
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => setIsSaveTemplateOpen(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {isApplyTemplateOpen && (
        <div
          className="task-modal-backdrop"
          onClick={() => { setIsApplyTemplateOpen(false); setEditingTemplateId(null); setApplyTemplateError(""); }}
        >
          <div className="task-modal apply-template-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="save-template-title">Шаблоны</h3>
            {applyTemplateError && (
              <p className="form-error-banner">{applyTemplateError}</p>
            )}

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
                      disabled={isSaving}
                      onClick={() => applyTemplateWithCheck(tpl)}
                    >
                      Импорт
                    </button>

                    <button
                      type="button"
                      className="template-edit-btn"
                      title="Редактировать шаблон (задачи, название, цвет, начало дня)"
                      onClick={() => enterTemplateEdit(tpl)}
                    >
                      ✎
                    </button>

                    <button
                      type="button"
                      className="template-delete-btn"
                      onClick={async () => {
                        const ok = window.confirm(
                          `Удалить шаблон "${tpl.name}"?`
                        );
                        if (!ok) return;

                        try {
                          await deleteDayTemplate(tpl.id);
                          setTemplates((prev) =>
                            prev.filter((item) => item.id !== tpl.id)
                          );
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {templates.length === 0 && (
              <div className="day-task-empty">
                Сохрани шаблон дня и используй его для похожих планов
              </div>
            )}
          </div>
        </div>
      )}

      {templateOverflowConfirm && (
        <div
          className="task-modal-backdrop"
          onClick={() => setTemplateOverflowConfirm(null)}
        >
          <div className="task-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Расписание выйдет за полночь</h3>
            <p className="conflict-modal-text">
              После применения шаблона{" "}
              <strong>«{templateOverflowConfirm.tpl.name}»</strong> расписание
              закончится в <strong>{templateOverflowConfirm.endTime}</strong>{" "}
              следующего дня — это уже после 24:00. Всё равно применить?
            </p>
            <div className="task-modal-buttons">
              <button
                type="button"
                className="primary-btn"
                onClick={() =>
                  applyTemplateWithCheck(templateOverflowConfirm.tpl, true)
                }
              >
                Применить
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setTemplateOverflowConfirm(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportWeekOpen && (
        <div className="task-modal-backdrop" onClick={closeImportWeekModal}>
          <div
            className="task-modal week-import-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Импорт из плана на неделю</h3>

            {importLoading && <div className="day-task-empty">Загрузка...</div>}

            {!importLoading && weekImportCandidates.length === 0 && (
              <div className="day-task-empty">
                Подходящих задач из недели для этого дня нет
              </div>
            )}

            {!importLoading && weekImportCandidates.length > 0 && (
              <div className="week-import-list">
                {upcomingImportCandidates.length > 0 && (
                  <>
                    <div className="week-import-section-title">Предстоит выполнить</div>

                    {upcomingImportCandidates.map((item) => {
                      const key = makeImportKey(item);
                      const checked = selectedImportItems.includes(key);

                      return (
                        <label key={key} className="week-import-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleImportItem(item)}
                          />

                          <div className="week-import-item-content">
                            <div className="week-import-item-top">
                              <span className="week-import-item-title">{item.title}</span>

                              <span className="week-import-item-day">
                                {formatImportCandidateDate(item)}
                              </span>
                            </div>

                            <div className="week-import-item-meta">
                              {item.category && (
                                <span>
                                  #{categories[item.category]?.title || item.category}
                                </span>
                              )}

                              {item.important && (
                                <span className="tag tag-important">важно</span>
                              )}

                              {item.task_type === "recurring" && (
                                <span className="tag tag-light">повтор</span>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </>
                )}

                {overdueImportCandidates.length > 0 && (
                  <>
                    <div className="week-import-section-title week-import-section-title--overdue">
                      Невыполненные
                    </div>

                    {overdueImportCandidates.map((item) => {
                      const key = makeImportKey(item);
                      const checked = selectedImportItems.includes(key);

                      return (
                        <label
                          key={key}
                          className="week-import-item week-import-item--overdue"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleImportItem(item)}
                          />

                          <div className="week-import-item-content">
                            <div className="week-import-item-top">
                              <span className="week-import-item-title">{item.title}</span>

                              <span className="week-import-item-day">
                                {formatImportCandidateDate(item)}
                              </span>
                            </div>

                            <div className="week-import-item-meta">
                              {item.category && (
                                <span>
                                  #{categories[item.category]?.title || item.category}
                                </span>
                              )}

                              {item.important && (
                                <span className="tag tag-important">важно</span>
                              )}

                              <span className="tag tag-overdue">просрочено</span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            <div className="task-modal-buttons">
              <button
                type="button"
                className="primary-btn"
                onClick={submitImportWeekTasks}
                disabled={selectedImportItems.length === 0}
              >
                Импортировать
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={closeImportWeekModal}
              >
                Отмена
              </button>
            </div>
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
  );
}
