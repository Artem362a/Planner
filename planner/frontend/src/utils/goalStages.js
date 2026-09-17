const SOON_DAYS = 3;
const MONTHS_SHORT = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

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

