// frontend/src/components/MonthCalendar.jsx
import React, { useMemo, useEffect, useState } from "react";

const WEEK_DAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

function getMonthCells(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekDay = (firstDay.getDay() + 6) % 7;
  const cells = [];
  let current = 1 - startWeekDay;

  for (let i = 0; i < 42; i += 1, current += 1) {
    const date = new Date(year, month, current);
    const inCurrentMonth = date.getMonth() === month;
    cells.push({ date, inCurrentMonth });
  }

  return cells;
}

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export default function MonthCalendar({ selectedDate, onDateChange }) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  useEffect(() => {
    setViewYear(selectedDate.getFullYear());
    setViewMonth(selectedDate.getMonth());
  }, [selectedDate]);

  const cells = useMemo(
    () => getMonthCells(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString(
    "ru-RU",
    { month: "long", year: "numeric" }
  );

  const goPrevMonth = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const goNextMonth = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  return (
    <div className="custom-month-calendar">
      <div className="custom-month-header">
        <button type="button" onClick={goPrevMonth}>
          ‹
        </button>
        <span className="custom-month-title">{monthLabel}</span>
        <button type="button" onClick={goNextMonth}>
          ›
        </button>
      </div>

      <div className="custom-month-weekdays">
        {WEEK_DAYS.map((w) => (
          <div key={w} className="custom-month-weekday">
            {w}
          </div>
        ))}
      </div>

      <div className="custom-month-grid">
        {cells.map((cell) => {
          const dayNum = cell.date.getDate();
          const selected = isSameDay(cell.date, selectedDate);

          return (
            <button
              key={cell.date.toISOString()}
              type="button"
              className={
                "custom-month-cell" +
                (cell.inCurrentMonth ? "" : " other") +
                (selected ? " selected" : "")
              }
              onClick={() => onDateChange(cell.date)}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}
