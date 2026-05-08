import { Link, useSearchParams } from "react-router-dom";
import DayPlanFull from "../../components/planning/day/DayPlanFull";

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function DayPlannerPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedDay = searchParams.get("date") || formatLocalDate(new Date());
  const selectedDate = parseLocalDate(selectedDay);
  const previousDay = formatLocalDate(addDays(selectedDate, -1));
  const nextDay = formatLocalDate(addDays(selectedDate, 1));

  function changeDay(day) {
    setSearchParams({ date: day });
  }

  function handleOpenWeekImport() {
    window.dispatchEvent(new CustomEvent("open-day-import-week"));
  }

  function handleOpenCreateTask() {
    window.dispatchEvent(new CustomEvent("open-day-create-task"));
  }

  return (
    <div className="app-wrapper">
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <Link to="/" className="back-link">
              ←
            </Link>
          </div>

          <div className="app-header-center">
            <div className="day-header-nav" aria-label="Переключение дней">
              <button
                type="button"
                className="day-header-nav-btn day-header-nav-btn--prev"
                onClick={() => changeDay(previousDay)}
                aria-label={`Предыдущий день, ${previousDay}`}
                title={`Предыдущий день: ${previousDay}`}
              >
                ‹
              </button>

              <span className="day-header-title">ПЛАН НА ДЕНЬ {selectedDay}</span>

              <button
                type="button"
                className="day-header-nav-btn day-header-nav-btn--next"
                onClick={() => changeDay(nextDay)}
                aria-label={`Следующий день, ${nextDay}`}
                title={`Следующий день: ${nextDay}`}
              >
                ›
              </button>
            </div>
          </div>

          <div className="app-header-right" />
        </header>

        <main className="day-page-main">
          <div className="day-page-layout">
            <div className="day-big-card">
              <DayPlanFull selectedDate={selectedDate} />
            </div>

            <div className="day-page-floating-actions">
              <button
                type="button"
                className="fab-secondary-task"
                onClick={handleOpenWeekImport}
                title="Импортировать из плана на неделю"
              >
                ↓
              </button>

              <button
                type="button"
                className="fab-add-task"
                onClick={handleOpenCreateTask}
                title="Добавить задачу"
              >
                +
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default DayPlannerPage;
