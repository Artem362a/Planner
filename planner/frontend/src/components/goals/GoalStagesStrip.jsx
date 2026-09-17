// Горизонтальная лента этапов цели: кружок с номером, под ним короткое
// название и дата. Клик по кружку отмечает этап выполненным. Единственное
// представление этапов в карточке — без дублирующего вертикального списка.

import { formatStageDate, stageDateStatus } from "../../utils/goalStages";

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
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
