import { useEffect, useRef, useState } from "react";

// Единый редактор этапов цели: используется и при создании, и при
// редактировании. Показывает этапы вертикальным таймлайном, позволяет
// тащить их за ручку для смены порядка, редактировать название и дедлайн.
//
// Контролируемый компонент: работает с массивом stages и отдаёт новый
// массив через onChange. Порядок в массиве = визуальный порядок = то, что
// родитель сохранит в order_index.

function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="3" r="1.4" />
      <circle cx="9" cy="3" r="1.4" />
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="9" cy="8" r="1.4" />
      <circle cx="3" cy="13" r="1.4" />
      <circle cx="9" cy="13" r="1.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function moveItem(arr, from, to) {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

// Равномерно раскидывает дедлайны от сегодня до срока цели: последний этап
// попадает на дату цели, промежуточные — пропорционально. Если срок уже прошёл
// (или совпадает с сегодня), все этапы садятся на дату цели.
function planEven(count, targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(end.getTime()) || end <= today) {
    return Array.from({ length: count }, () => targetDate);
  }

  const totalDays = Math.max(1, Math.round((end.getTime() - today.getTime()) / 86400000));
  const step = totalDays / count;

  return Array.from({ length: count }, (_, i) => {
    const planned = new Date(today);
    planned.setDate(today.getDate() + Math.max(1, Math.round(step * (i + 1))));
    return planned > end ? targetDate : formatDateInput(planned);
  });
}

// Даёт этапам даты по фиксированному шагу от сегодня (раз в N дней / неделю /
// месяц) — независимо от срока цели.
function planByStep(count, kind, interval) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, i) => {
    if (kind === "monthly") {
      return formatDateInput(addMonths(today, i + 1));
    }
    const days = kind === "weekly" ? 7 : Math.max(1, Number(interval) || 1);
    const planned = new Date(today);
    planned.setDate(today.getDate() + days * (i + 1));
    return formatDateInput(planned);
  });
}

export default function GoalStagesEditor({ stages, onChange, targetDate, title }) {
  const [newTitle, setNewTitle] = useState("");
  const [dragIndex, setDragIndex] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [everyN, setEveryN] = useState(7);
  const itemRefs = useRef([]);
  const menuRef = useRef(null);

  // Закрываем меню распределения по клику вне него.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function updateStage(id, patch) {
    onChange(stages.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeStage(id) {
    onChange(stages.filter((s) => s.id !== id));
  }

  function addStage() {
    const title = newTitle.trim();
    if (!title) return;
    onChange([
      ...stages,
      {
        id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title,
        done: false,
        planned_date: "",
        _isNew: true,
      },
    ]);
    setNewTitle("");
  }

  function applyDistribution(mode) {
    if (stages.length === 0) return;
    let dates;
    if (mode === "even") {
      if (!targetDate) return;
      dates = planEven(stages.length, targetDate);
    } else {
      dates = planByStep(stages.length, mode, everyN);
    }
    onChange(stages.map((s, i) => ({ ...s, planned_date: dates[i] })));
    setMenuOpen(false);
  }

  function handlePointerDown(e, index) {
    // Только основная кнопка / касание.
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    setDragIndex(index);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* некоторые окружения не поддерживают capture — не критично */
    }
  }

  function handlePointerMove(e) {
    if (dragIndex == null) return;
    const y = e.clientY;
    let target = dragIndex;
    for (let i = 0; i < itemRefs.current.length; i += 1) {
      const el = itemRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        target = i;
        break;
      }
      // Выше самого первого / ниже самого последнего — прижимаем к краю.
      if (i === 0 && y < rect.top) target = 0;
      if (i === itemRefs.current.length - 1 && y > rect.bottom) target = i;
    }
    if (target !== dragIndex) {
      onChange(moveItem(stages, dragIndex, target));
      setDragIndex(target);
    }
  }

  function handlePointerUp(e) {
    if (dragIndex == null) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* см. выше */
    }
    setDragIndex(null);
  }

  return (
    <div className="goal-timeline-editor">
      {(title || stages.length > 0) && (
        <div className="goal-timeline-header">
          {title && <span className="goal-timeline-heading">{title}</span>}
          {stages.length > 0 && (
            <div className="goal-timeline-toolbar" ref={menuRef}>
              <button
                type="button"
                className={
                  "goal-timeline-distribute" + (menuOpen ? " is-open" : "")
                }
                onClick={() => setMenuOpen((o) => !o)}
              >
                Распределить дедлайны
                <span className="goal-timeline-distribute-caret">▾</span>
              </button>

              {menuOpen && (
            <div className="goal-timeline-menu">
              <button
                type="button"
                className="goal-timeline-menu-item"
                onClick={() => applyDistribution("even")}
                disabled={!targetDate}
                title={targetDate ? undefined : "Нужен срок цели"}
              >
                Равномерно до срока
                {!targetDate && (
                  <span className="goal-timeline-menu-hint">нужен срок</span>
                )}
              </button>

              <button
                type="button"
                className="goal-timeline-menu-item"
                onClick={() => applyDistribution("weekly")}
              >
                Каждую неделю
              </button>

              <button
                type="button"
                className="goal-timeline-menu-item"
                onClick={() => applyDistribution("monthly")}
              >
                Каждый месяц
              </button>

              <div className="goal-timeline-menu-nrow">
                <span>Раз в</span>
                <input
                  type="number"
                  min="1"
                  value={everyN}
                  onChange={(e) => setEveryN(e.target.value)}
                />
                <span>дней</span>
                <button
                  type="button"
                  className="goal-timeline-menu-apply"
                  onClick={() => applyDistribution("every_n_days")}
                >
                  ОК
                </button>
              </div>
            </div>
              )}
            </div>
          )}
        </div>
      )}

      {stages.length > 0 && (
        <ul className="goal-timeline">
          {stages.map((stage, index) => (
            <li
              key={stage.id}
              ref={(el) => (itemRefs.current[index] = el)}
              className={
                "goal-timeline-item" +
                (stage.done ? " is-done" : "") +
                (dragIndex === index ? " is-dragging" : "")
              }
            >
              <div className="goal-timeline-rail">
                <span className="goal-timeline-line goal-timeline-line--top" />
                <button
                  type="button"
                  className="goal-timeline-dot"
                  onClick={() => updateStage(stage.id, { done: !stage.done })}
                  title={stage.done ? "Снять отметку" : "Отметить выполненным"}
                >
                  {stage.done ? <CheckIcon /> : index + 1}
                </button>
                <span className="goal-timeline-line goal-timeline-line--bottom" />
              </div>

              <div className="goal-timeline-body">
                <div className="goal-timeline-head">
                  <button
                    type="button"
                    className="goal-timeline-handle"
                    aria-label="Перетащить этап"
                    onPointerDown={(e) => handlePointerDown(e, index)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    <GripIcon />
                  </button>

                  <input
                    type="text"
                    className="goal-timeline-title"
                    value={stage.title}
                    placeholder="Название этапа"
                    onChange={(e) => updateStage(stage.id, { title: e.target.value })}
                  />

                  <button
                    type="button"
                    className="goal-timeline-remove"
                    onClick={() => removeStage(stage.id)}
                    title="Удалить этап"
                  >
                    ×
                  </button>
                </div>

                <div className="goal-timeline-meta">
                  <span className="goal-timeline-date-label">Дедлайн</span>
                  <input
                    type="date"
                    className="goal-timeline-date"
                    value={stage.planned_date || ""}
                    onChange={(e) =>
                      updateStage(stage.id, { planned_date: e.target.value })
                    }
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {stages.length === 0 && (
        <div className="goal-timeline-empty">
          Этапов пока нет — добавь первый шаг к цели
        </div>
      )}

      <div className="goal-timeline-add">
        <div className="goal-timeline-rail">
          <span className="goal-timeline-add-dot" />
        </div>
        <div className="goal-timeline-add-body">
          <input
            type="text"
            placeholder="Новый этап"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStage();
              }
            }}
          />
          <button
            type="button"
            className="goal-timeline-add-btn"
            onClick={addStage}
            aria-label="Добавить этап"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
