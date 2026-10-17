export function parseUtcDate(value) {
  if (!value) return null;
  const text = String(value).replace(/(\.\d{3})\d+/, "$1");
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUtcDateTime(value) {
  const date = parseUtcDate(value);
  return date ? date.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "—";
}

export function formatPlanDate(value, options = {}) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU", {
    day: "numeric", month: "short", ...options,
  });
}
