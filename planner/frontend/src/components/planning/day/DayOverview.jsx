import { useEffect, useMemo, useState } from "react";
import {
  fetchDayTasks,
  fetchCategories,
  fetchDaySettings,
  updateDayTask,
} from "../../../api/tasks";
import { CategoryIcon } from "../../icons";

function addMinutesToTime(timeStr, minutesToAdd) {
  const [hh, mm] = timeStr.split(":").map(Number);
  const base = hh * 60 + mm + (minutesToAdd || 0);
  const total = Math.max(base, 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

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
      icon: item.icon || "tag",
    };
  }
  return result;
}

function formatDuration(durationMin) {
  const minutes = Number(durationMin);

  if (!Number.isFinite(minutes) || minutes <= 0) return "";

  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hh, mm] = timeStr.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function ImportantToday({ selectedDay }) {
  const dayString = selectedDay;

  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [viewMode, setViewMode] = useState("timeline");
  const [subtaskTaskId, setSubtaskTaskId] = useState(null);
  const [dayStartTime, setDayStartTime] = useState("06:00");
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchDayTasks(dayString)
        .then((data) => {
          if (!cancelled) setTasks(data);
        })
        .catch(console.error);
    };

    load();

    const onChange = (event) => {
      if (!event?.detail?.dayString || event.detail.dayString === dayString) {
        load();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };

    window.addEventListener("day-tasks-changed", onChange);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("day-tasks-changed", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dayString]);

  useEffect(() => {
    fetchDaySettings(dayString)
      .then((settings) => setDayStartTime(settings?.start_time || "06:00"))
      .catch((error) => {
        console.error(error);
        setDayStartTime("06:00");
      });
  }, [dayString]);

  useEffect(() => {
    fetchCategories()
      .then((items) => {
        setCategories(categoriesArrayToMap(items || []));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60_000);

    return () => window.clearInterval(timerId);
  }, []);

  const tasksWithComputedTime = useMemo(() => {
    const dayStartMinutes = timeStringToMinutes(dayStartTime);
    let offset = 0;

    return tasks.map((t) => {
      const duration = t.duration_min || 0;

      if (t.start_time) {
        offset = timeStringToMinutes(t.start_time) - dayStartMinutes;
      }

      const start = addMinutesToTime(dayStartTime, offset);
      const end = addMinutesToTime(start, duration);

      offset += duration;

      return {
        ...t,
        computed_start_time: start,
        computed_end_time: end,
        timeline_start_min: timeStringToMinutes(start),
        timeline_end_min: timeStringToMinutes(end),
      };
    });
  }, [tasks, dayStartTime]);

  const importantTasks = useMemo(
    () => tasksWithComputedTime.filter((t) => t.priority === "high"),
    [tasksWithComputedTime]
  );

  const visibleTimelineTasks = useMemo(() => {
    const dayStartMinutes = timeStringToMinutes(dayStartTime);
    return tasksWithComputedTime.filter(
      (t) => t.timeline_start_min < dayStartMinutes + 1440
    );
  }, [tasksWithComputedTime, dayStartTime]);

  const timelineData = useMemo(() => {
    const startMinute = timeStringToMinutes(dayStartTime);
    const lastEnd = visibleTimelineTasks.reduce(
      (max, task) => Math.max(max, task.timeline_end_min || startMinute),
      startMinute + 60
    );
    const endMinute = Math.max(startMinute + 60, Math.ceil(lastEnd / 60) * 60);
    const pxPerMinute = 1.6;
    const hours = [];

    for (
      let minute = Math.floor(startMinute / 60) * 60;
      minute <= endMinute;
      minute += 60
    ) {
      hours.push(minute);
    }

    return {
      startMinute,
      endMinute,
      pxPerMinute,
      height: Math.max(220, (endMinute - startMinute) * pxPerMinute),
      hours,
    };
  }, [visibleTimelineTasks, dayStartTime]);

  const timelineLayouts = useMemo(() => {
    const smallTaskMinutes = 20;
    const maxAttachedSmallGroupMinutes = 30;
    const minTaskHeight = 46;
    const attachedRowHeight = 14;
    const expandedGroupRowHeight = 20;
    const { startMinute, pxPerMinute } = timelineData;
    const pendingBefore = new Map();
    const items = [];

    const isSmallTask = (task) =>
      (task.duration_min || 0) <= smallTaskMinutes;

    const getStart = (item) => item.timeline_start_min;
    const getEnd = (item) => item.timeline_end_min;

    const makeSmallGroup = (run) => ({
      type: "small-group",
      id: `small-${run[0].id}-${run[run.length - 1].id}`,
      tasks: run,
      category: run[0].category,
      priority: run.some((task) => task.priority === "high") ? "high" : run[0].priority,
      status: run.every((task) => Number(task.status) === 1) ? 1 : 0,
      title: "Короткие задачи",
      computed_start_time: run[0].computed_start_time,
      computed_end_time: run[run.length - 1].computed_end_time,
      timeline_start_min: run[0].timeline_start_min,
      timeline_end_min: run[run.length - 1].timeline_end_min,
    });

    const normalizeSmallRun = (run) =>
      run.length > 1 ? [makeSmallGroup(run)] : run;

    // Compute just heights + time ranges, tops assigned after scale is built
    const makeLayout = (task, before = [], after = []) => {
      const attached = [...before, ...after];
      const start = attached.length > 0
        ? Math.min(task.timeline_start_min, ...attached.map(getStart))
        : task.timeline_start_min;
      const end = attached.length > 0
        ? Math.max(task.timeline_end_min, ...attached.map(getEnd))
        : task.timeline_end_min;
      const attachedHeight = attached.length * attachedRowHeight;
      const isExpandedGroup = task.type === "small-group" && attached.length === 0 && expandedGroupId === task.id;
      const height = isExpandedGroup
        ? minTaskHeight + task.tasks.length * expandedGroupRowHeight
        : Math.max(minTaskHeight + attachedHeight, (end - start) * pxPerMinute - 3);

      return { type: "task", task, before, after, start, end, height, top: 0 };
    };

    for (let index = 0; index < visibleTimelineTasks.length; index += 1) {
      const task = visibleTimelineTasks[index];

      if (!isSmallTask(task)) {
        items.push(makeLayout(task, pendingBefore.get(task.id) || []));
        pendingBefore.delete(task.id);
        continue;
      }

      const run = [task];
      let cursor = index + 1;

      while (
        cursor < visibleTimelineTasks.length &&
        isSmallTask(visibleTimelineTasks[cursor])
      ) {
        run.push(visibleTimelineTasks[cursor]);
        cursor += 1;
      }

      const previousLayout = items[items.length - 1];
      const nextTask = visibleTimelineTasks[cursor];
      const nextIsLarge = nextTask && !isSmallTask(nextTask);
      const standaloneTask = run.length > 1 ? makeSmallGroup(run) : run[0];
      const runDuration = run.reduce(
        (total, smallTask) => total + (smallTask.duration_min || 0),
        0
      );
      const shouldAttachRun =
        run.length === 1 || runDuration <= maxAttachedSmallGroupMinutes;
      const attachedRun = shouldAttachRun ? normalizeSmallRun(run) : [];

      if (!shouldAttachRun) {
        items.push(makeLayout(standaloneTask));
        index = cursor - 1;
        continue;
      }

      if (nextIsLarge) {
        pendingBefore.set(nextTask.id, [
          ...(pendingBefore.get(nextTask.id) || []),
          ...attachedRun,
        ]);
      } else if (previousLayout?.type === "task") {
        previousLayout.after.push(...attachedRun);
        Object.assign(
          previousLayout,
          makeLayout(previousLayout.task, previousLayout.before, previousLayout.after)
        );
      } else {
        items.push(makeLayout(standaloneTask));
      }

      index = cursor - 1;
    }

    // Build piecewise-linear scale: inflate Y where min-height > natural height
    // so hour markers and task tops are consistent with task heights.
    const scalePoints = [{ minute: startMinute, y: 0 }];
    let curMinute = startMinute;
    let curY = 0;

    const sortedByStart = [...items].sort((a, b) => a.start - b.start);

    for (const item of sortedByStart) {
      if (item.start > curMinute) {
        curY += (item.start - curMinute) * pxPerMinute;
        curMinute = item.start;
        scalePoints.push({ minute: curMinute, y: curY });
      }
      curY += item.height;
      curMinute = item.end;
      scalePoints.push({ minute: curMinute, y: curY });
    }

    const minuteToY = (minute) => {
      if (minute <= scalePoints[0].minute) return scalePoints[0].y;
      for (let i = 1; i < scalePoints.length; i++) {
        const prev = scalePoints[i - 1];
        const next = scalePoints[i];
        if (minute <= next.minute) {
          const t = (minute - prev.minute) / Math.max(1, next.minute - prev.minute);
          return prev.y + (next.y - prev.y) * t;
        }
      }
      const last = scalePoints[scalePoints.length - 1];
      return last.y + (minute - last.minute) * pxPerMinute;
    };

    // Assign tops using scale
    for (const item of items) {
      item.top = Math.max(0, minuteToY(item.start));
    }

    return {
      items,
      minuteToY,
      height: Math.max(
        180,
        timelineData.height,
        ...items.map((item) => item.top + item.height + 28)
      ),
    };
  }, [visibleTimelineTasks, timelineData, expandedGroupId]);

  const timelineNowMarker = useMemo(() => {
    if (dayString !== formatLocalDate(currentTime)) {
      return null;
    }

    const currentMinute = currentTime.getHours() * 60 + currentTime.getMinutes();

    if (currentMinute < timelineData.startMinute) {
      return null;
    }

    const top = Math.min(timelineLayouts.height, Math.max(0, timelineLayouts.minuteToY(currentMinute)));

    return {
      top,
      height: top,
      label: currentTime.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }, [currentTime, dayString, timelineData, timelineLayouts]);

  const toggleExpanded = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const toggleStatus = async (task) => {
    const nextStatus = Number(task.status) === 1 ? 0 : 1;

    try {
      const updated = await updateDayTask(dayString, task.id, {
        ...task,
        status: nextStatus,
      });

      setTasks((prev) => prev.map((item) => (item.id === task.id ? updated : item)));
    } catch (error) {
      console.error(error);
    }
  };

  const toggleSubtask = async (task, subtask) => {
    const updatedSub = { ...subtask, done: !subtask.done };
    const updatedTask = {
      ...task,
      subtasks: (task.subtasks || []).map((s) => s.id === subtask.id ? updatedSub : s),
    };
    const allDone = updatedTask.subtasks.length > 0 && updatedTask.subtasks.every((s) => s.done);
    if (allDone) updatedTask.status = 1;
    if (updatedTask.subtasks.some((s) => !s.done)) updatedTask.status = 0;

    try {
      const saved = await updateDayTask(dayString, task.id, updatedTask);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch (e) {
      console.error(e);
    }
  };

  const renderSwitcher = () => (
    <div className="day-overview-mode">
      <button
        type="button"
        className={viewMode === "timeline" ? "active" : ""}
        onClick={() => setViewMode("timeline")}
      >
        Таймлайн
      </button>
      <button
        type="button"
        className={viewMode === "important" ? "active" : ""}
        onClick={() => setViewMode("important")}
      >
        Важное
      </button>
    </div>
  );

  const renderTimelineAttachedTask = (task) => (
    task.type === "small-group" ? (
      <div key={task.id} className="day-overview-timeline-attached">
        <span>{task.tasks.length} коротких задач</span>
        <em>
          {task.computed_start_time} - {task.computed_end_time}
        </em>
      </div>
    ) : (
      <div key={task.id} className="day-overview-timeline-attached">
        <span>{task.title}</span>
        <em>
          {task.computed_start_time}
          {task.duration_min ? ` - ${task.computed_end_time}` : ""}
        </em>
      </div>
    )
  );

  if (viewMode === "timeline") {
    return (
      <div className="important-card">
        {renderSwitcher()}

        {visibleTimelineTasks.length === 0 ? (
          <div className="important-empty">Сегодня нет задач</div>
        ) : (
          <div className="day-overview-timeline-scroll">
            <div
              className="day-overview-timeline-board"
              style={{ minHeight: `${timelineLayouts.height}px` }}
            >
              <div className="day-overview-timeline-hours">
                {timelineData.hours.map((minute) => (
                  <div
                    key={minute}
                    className="day-overview-timeline-hour"
                    style={{ top: `${Math.max(6, timelineLayouts.minuteToY(minute))}px` }}
                  >
                    {`${String(Math.floor(minute / 60)).padStart(2, "0")}:00`}
                  </div>
                ))}
              </div>

              <div className="day-overview-timeline-track">
                {timelineNowMarker && (
                  <div
                    className="day-overview-now-marker"
                    style={{
                      "--now-marker-top": `${timelineNowMarker.top}px`,
                      "--now-marker-height": `${timelineNowMarker.height}px`,
                    }}
                    title={`Сейчас ${timelineNowMarker.label}`}
                    aria-hidden="true"
                  >
                    <span className="day-overview-now-line" />
                    <span className="day-overview-now-dot" />
                  </div>
                )}

                {timelineData.hours.map((minute) => (
                  <div
                    key={minute}
                    className="day-overview-timeline-line"
                    style={{ top: `${Math.max(0, timelineLayouts.minuteToY(minute))}px` }}
                  />
                ))}

              {timelineLayouts.items.map(({ task: t, before = [], after = [], top, height }) => {
                const categoryColor = categories[t.category]?.color || "#BBBBBB";
                const categoryTitle = categories[t.category]?.title || t.category;
                const isDone = Number(t.status) === 1;
                const isImportant = t.priority === "high";
                const attachedCount = before.length + after.length;
                const isSmallGroup = t.type === "small-group";

                const bgColor = isDone ? "#aaaaaa" : categoryColor;

                return (
                  <article
                    key={t.id}
                    className={
                      "day-overview-timeline-item" +
                      (isDone ? " is-done" : "") +
                      (isImportant ? " is-important" : "") +
                      (attachedCount > 0 || isSmallGroup ? " has-attached" : "")
                    }
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      borderLeftColor: isDone ? "#aaaaaa" : categoryColor,
                      backgroundColor: isDone ? "#aaaaaa16" : `${categoryColor}16`,
                      cursor: isSmallGroup ? "default" : "pointer",
                    }}
                    onClick={isSmallGroup ? undefined : () => toggleStatus(t)}
                  >
                    <div
                      className="day-overview-timeline-icon"
                      style={{
                        color: isDone ? "#aaaaaa" : categoryColor,
                        backgroundColor: `${bgColor}22`,
                      }}
                    >
                      <CategoryIcon name={categories[t.category]?.icon || "tag"} />
                    </div>

                    <div className="day-overview-timeline-body">
                      {before.map(renderTimelineAttachedTask)}
                      {isSmallGroup ? (
                        <>
                          <div className="day-overview-sg-header">
                            <span className="day-overview-timeline-title">
                              {t.tasks.length} коротких задач
                            </span>
                            <button
                              type="button"
                              className="day-overview-sg-toggle"
                              onClick={(e) => { e.stopPropagation(); setExpandedGroupId((prev) => prev === t.id ? null : t.id); }}
                            >
                              {expandedGroupId === t.id ? "▲" : "▼"}
                            </button>
                          </div>
                          <div className="day-overview-timeline-meta">
                            <span>{t.computed_start_time} – {t.computed_end_time}</span>
                          </div>
                          {expandedGroupId === t.id && (
                            <div className="day-overview-sg-list">
                              {t.tasks.map((smallTask) => (
                                <div key={smallTask.id} className="day-overview-sg-task">
                                  <span>{smallTask.title}</span>
                                  <em>
                                    {smallTask.computed_start_time}
                                    {smallTask.duration_min ? ` – ${smallTask.computed_end_time}` : ""}
                                  </em>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="day-overview-timeline-title">{t.title}</div>
                          <div className="day-overview-timeline-time-row">
                            <span className="day-overview-timeline-meta-time">
                              {t.computed_start_time}
                              {t.duration_min ? ` – ${t.computed_end_time}` : ""}
                            </span>
                            {t.subtasks?.length > 0 && (
                              <button
                                type="button"
                                className="day-timeline-subtask-badge"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSubtaskTaskId(t.id);
                                }}
                              >
                                {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} подзадач
                              </button>
                            )}
                          </div>
                        </>
                      )}
                      {after.map(renderTimelineAttachedTask)}
                    </div>
                  </article>
                );
              })}
              </div>
            </div>
          </div>
        )}

        {subtaskTaskId && (() => {
          const stTask = tasksWithComputedTime.find((t) => t.id === subtaskTaskId);
          if (!stTask) return null;
          return (
            <div className="task-modal-backdrop" onClick={() => setSubtaskTaskId(null)}>
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
                  onClick={() => setSubtaskTaskId(null)}
                >
                  Закрыть
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  if (importantTasks.length === 0) {
    return (
      <div className="important-card">
        {renderSwitcher()}
        <div className="important-empty">Сегодня нет важных задач</div>
      </div>
    );
  }

  return (
    <div className="important-card">
      {renderSwitcher()}
      <div className="day-overview-scroll">
        <ul className="important-list">
          {importantTasks.map((t) => {
            const hasSubtasks = Array.isArray(t.subtasks) && t.subtasks.length > 0;
            const isExpanded = expandedId === t.id;
            const categoryColor = categories[t.category]?.color || "#BBBBBB";
            const categoryTitle = categories[t.category]?.title || t.category;

            return (
              <li key={t.id} className="important-task-item">
                <div
                  className="important-color-bar"
                  style={{ backgroundColor: categoryColor }}
                />

                <label className="important-checkbox">
                  <input
                    type="checkbox"
                    checked={Number(t.status) === 1}
                    onChange={() => toggleStatus(t)}
                  />
                  <span />
                </label>

                <div className="important-task-dot-wrap">
                  <span
                    className="important-task-dot"
                    style={{ backgroundColor: categoryColor }}
                  />
                </div>

                <div className="important-content">
                  <div className="important-top-row">
                    <span className="important-name">{t.title}</span>

                    <div className="important-right">
                      {hasSubtasks && (
                        <button
                          type="button"
                          className="important-toggle-icon"
                          onClick={() => toggleExpanded(t.id)}
                        >
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      )}

                      <span className="important-time">
                        {t.computed_start_time}
                        {t.duration_min ? `–${t.computed_end_time}` : null}
                      </span>
                    </div>
                  </div>

                  <div className="important-meta">
                    {t.duration_min ? <span>{formatDuration(t.duration_min)}</span> : null}

                    {t.category ? <span>#{categoryTitle}</span> : null}
                  </div>

                  {hasSubtasks && isExpanded && (
                    <ul className="important-subtasks">
                      {t.subtasks.map((s) => (
                        <li key={s.id} className="important-subtask">
                          {s.done ? "● " : "○ "}
                          {s.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default ImportantToday;
