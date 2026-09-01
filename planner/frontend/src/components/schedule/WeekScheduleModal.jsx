import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchScheduleWeek } from "../../api/schedule";

const TYPE_LABELS = {
  lecture: "Лекция",
  practice: "Практика",
  lab: "Лабораторная",
  other: "Занятие",
};

function addDays(dateString, count) {
  const [year, month, day] = dateString.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + count);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayLabel(dateString, long = false) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("ru-RU", {
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "numeric",
  });
}

function rangeDateLabel(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

function locationLabel(location) {
  if (!location) return "";
  const parts = location.split("/").map((part) => part.trim()).filter(Boolean);
  const value = parts.at(-1) || location.trim();
  return /^online$/i.test(value) ? "онлайн" : value;
}

function EventCard({ event }) {
  const place = locationLabel(event.location);
  return (
    <article className={`schedule-event schedule-event--${event.lesson_type}`}>
      <div className="schedule-event-topline">
        <span>{TYPE_LABELS[event.lesson_type] || TYPE_LABELS.other}</span>
        {event.subgroup && <span>{event.subgroup} п/г</span>}
      </div>
      <strong>{event.subject}</strong>
      {event.teacher && <div className="schedule-event-teacher">{event.teacher}</div>}
      {place && <div className="schedule-event-location">{place}</div>}
      {event.conference_url && (
        <a href={event.conference_url} target="_blank" rel="noreferrer">
          Перейти в конференцию
        </a>
      )}
    </article>
  );
}

export default function WeekScheduleModal({ weekStart, onClose }) {
  const [currentWeek, setCurrentWeek] = useState(weekStart);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    fetchScheduleWeek(currentWeek)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || "Не удалось загрузить расписание");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentWeek]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(currentWeek, index)),
    [currentWeek]
  );
  const slots = useMemo(() => {
    const values = new Map();
    for (const event of data?.events || []) {
      values.set(`${event.start_time}-${event.end_time}`, {
        start: event.start_time,
        end: event.end_time,
      });
    }
    return [...values.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [data]);

  const eventsByCell = useMemo(() => {
    const result = new Map();
    for (const event of data?.events || []) {
      const key = `${event.day}|${event.start_time}-${event.end_time}`;
      const list = result.get(key) || [];
      list.push(event);
      result.set(key, list);
    }
    return result;
  }, [data]);

  function moveWeek(offset) {
    setLoading(true);
    setError("");
    setCurrentWeek((value) => addDays(value, offset));
  }

  return (
    <div className="modal-overlay schedule-modal-overlay" onClick={onClose}>
      <section
        className="schedule-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="schedule-modal-header">
          <div className="schedule-modal-title">
            <span className="schedule-modal-eyebrow">План на неделю</span>
            <h2 id="schedule-modal-title">Расписание пар</h2>
            <div className="schedule-week-navigation">
              <button
                type="button"
                onClick={() => moveWeek(-7)}
                aria-label="Предыдущая неделя"
              >
                ‹
              </button>
              <span>{rangeDateLabel(days[0])} — {rangeDateLabel(days[6])}</span>
              <button
                type="button"
                onClick={() => moveWeek(7)}
                aria-label="Следующая неделя"
              >
                ›
              </button>
            </div>
          </div>
          <button type="button" className="schedule-modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="schedule-modal-body">
          {loading && <div className="schedule-modal-state">Загружаем расписание…</div>}
          {!loading && error && <div className="schedule-modal-state schedule-modal-state--error">{error}</div>}
          {!loading && !error && data && !data.connected && (
            <div className="schedule-modal-state">
              <strong>Расписание ещё не подключено</strong>
              <span>Добавь ссылку ICS в настройках аккаунта.</span>
              <Link to="/account" onClick={onClose}>Перейти в аккаунт</Link>
            </div>
          )}
          {!loading && !error && data?.connected && slots.length === 0 && (
            <div className="schedule-modal-state">
              На этой неделе занятий нет.
            </div>
          )}

          {!loading && !error && data?.connected && slots.length > 0 && (
            <>
              <div className="schedule-timetable">
                <div className="schedule-timetable-head schedule-timetable-time">Время</div>
                {days.map((day) => (
                  <div className="schedule-timetable-head" key={day}>{dayLabel(day)}</div>
                ))}
                {slots.map((slot) => (
                  <div className="schedule-timetable-row" key={`${slot.start}-${slot.end}`}>
                    <div className="schedule-timetable-slot">
                      <strong>{slot.start}</strong>
                      <span>{slot.end}</span>
                    </div>
                    {days.map((day) => (
                      <div className="schedule-timetable-cell" key={day}>
                        {(eventsByCell.get(`${day}|${slot.start}-${slot.end}`) || []).map((event) => (
                          <EventCard event={event} key={event.id} />
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="schedule-agenda">
                {days.map((day) => {
                  const events = (data.events || []).filter((event) => event.day === day);
                  if (!events.length) return null;
                  return (
                    <section className="schedule-agenda-day" key={day}>
                      <h3>{dayLabel(day, true)}</h3>
                      {events.map((event) => (
                        <div className="schedule-agenda-item" key={event.id}>
                          <div className="schedule-agenda-time">
                            <strong>{event.start_time}</strong>
                            <span>{event.end_time}</span>
                          </div>
                          <EventCard event={event} />
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
