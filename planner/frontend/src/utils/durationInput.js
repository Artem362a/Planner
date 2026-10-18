export function formatDurationInput(raw, deleting = false) {
  const colon = raw.indexOf(":");
  if (colon >= 0) {
    const hours = raw.slice(0, colon).replace(/\D/g, "").slice(0, 2);
    const minutes = raw.slice(colon + 1).replace(/\D/g, "").slice(0, 2);
    return hours || minutes ? `${hours}:${minutes}` : "";
  }
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length > 2) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return digits.length === 2 && !deleting ? `${digits}:` : digits;
}

export function completeDurationInput(value) {
  const normalized = value.startsWith(":") ? `0${value}` : value;
  const match = normalized.match(/^(\d{1,2})(?::(\d{0,2}))?$/);
  if (!match || Number(match[2] || 0) > 59) return value;
  return `${match[1].padStart(2, "0")}:${(match[2] || "0").padStart(2, "0")}`;
}
