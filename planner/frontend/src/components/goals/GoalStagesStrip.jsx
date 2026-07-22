// Горизонтальная лента этапов цели: кружок с номером, под ним короткое
// название и дата. Клик по кружку отмечает этап выполненным. Единственное
// представление этапов в карточке — без дублирующего вертикального списка.

const SOON_DAYS = 3;
const MONTHS_SHORT = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(`${str}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatStageDate(str) {
  const d = parseDate(str);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function stageDateStatus(stage) {
  if (stage.done) return "done";
  const d = parseDate(stage.planned_date);
  if (!d) return "none";
  const today = todayMidnight();
  if (d < today) return "overdue";
  const soon = new Date(today);
  soon.setDate(today.getDate() + SOON_DAYS);
  if (d <= soon) return "soon";
  return "future";
}

// Сводка для чипов в шапке карточки (сколько сделано, сколько просрочено).
export function summarizeStages(stages) {
  const list = Array.isArray(stages) ? stages : [];
  const total = list.length;
  const done = list.filter((s) => s.done).length;
  const today = todayMidnight();
  const overdueCount = list.filter((s) => {
    if (s.done) return false;
    const d = parseDate(s.planned_date);
    return d && d < today;
  }).length;
  return { total, done, overdueCount, allDone: total > 0 && done === total };
}

export default function GoalStagesStrip({ stages, color, onToggle }) {
  const accent = color || "#7c62e6";
  const currentIndex = stages.findIndex((s) => !s.done);

  return (
    <div className="ghs" style={{ "--goal-accent": accent }}>
      {stages.map((stage, i) => {
        const status = stageDateStatus(stage);
        return (
          <div
            key={stage.id}
            className={
              "ghs-item" +
              (stage.done ? " is-done" : "") +
              (i === currentIndex ? " is-current" : "")
            }
          >
            <div className="ghs-rail">
              <span
                className={
                  "ghs-line ghs-line--left" +
                  (i > 0 && stages[i - 1].done ? " is-filled" : "")
                }
              />
              <button
                type="button"
                className="ghs-dot"
                onClick={() => onToggle(stage)}
                title={stage.done ? "Снять отметку" : "Отметить выполненным"}
              >
                {stage.done ? <CheckIcon /> : i + 1}
              </button>
              <span
                className={
                  "ghs-line ghs-line--right" + (stage.done ? " is-filled" : "")
                }
              />
            </div>

            <div className="ghs-name" title={stage.title}>
              {stage.title}
            </div>

            {stage.planned_date && (
              <div
                className={
                  "ghs-date" + (status === "overdue" ? " ghs-date--overdue" : "")
                }
              >
                {formatStageDate(stage.planned_date)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
