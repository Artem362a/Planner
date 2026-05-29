// Timeline math shared by the day views.
//
// The day timeline uses a "stretched day" model: minutes accumulate from the
// day's start time and are NOT wrapped at 24h. A task that runs past midnight
// keeps counting ("25:30"), so its minute value stays monotonic and the
// timeline sort/placement keeps working. Do not add a `% 24` here — it would
// make a post-midnight task fold back before the day start and break layout.

export function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hh, mm] = timeStr.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

export function addMinutesToTime(timeStr, minutesToAdd) {
  const [hh, mm] = timeStr.split(":").map(Number);
  const base = hh * 60 + mm + (minutesToAdd || 0);
  const total = Math.max(base, 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
