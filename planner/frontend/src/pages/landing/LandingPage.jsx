import { Link } from "react-router-dom";
import "../../styles/pages/landing.css";

function LogoIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <rect width="34" height="34" rx="10" fill="rgba(255,255,255,0.18)" />
      <rect x="8" y="12" width="18" height="14" rx="3.5" fill="rgba(255,255,255,0.9)" />
      <rect x="12" y="7" width="2" height="8" rx="1" fill="white" />
      <rect x="20" y="7" width="2" height="8" rx="1" fill="white" />
      <rect x="8" y="17" width="18" height="1.5" fill="rgba(255,255,255,0.38)" />
      <rect x="11" y="21" width="4" height="3" rx="1" fill="#7b5ecf" />
      <rect x="18" y="21" width="4" height="3" rx="1" fill="#7b5ecf" fillOpacity="0.5" />
    </svg>
  );
}

function DayMockup() {
  const tasks = [
    { time: "09:00", name: "Зарядка", done: true, color: "#9B7BE8" },
    { time: "10:30", name: "Написать отчёт", color: "#7EA7F2" },
    { time: "12:30", name: "Встреча с Игорем", color: "#7b5ecf", active: true },
    { time: "15:00", name: "Спортзал", color: "#5FD6C0" },
    { time: "19:00", name: "Почитать книгу", color: "#F0B36A" },
  ];

  return (
    <div className="lm-card">
      <div className="lm-card-top">
        <span className="lm-card-top-title">Среда, 26 мая</span>
        <div className="lm-day-toggle">
          <span className="lm-day-toggle-btn">Список</span>
          <span className="lm-day-toggle-btn lm-day-toggle-btn--active">Время</span>
        </div>
      </div>
      <div className="lm-tasks">
        {tasks.map((t) => (
          <div
            key={t.time}
            className={`lm-task${t.done ? " lm-task--done" : ""}${t.active ? " lm-task--active" : ""}`}
            style={{ borderLeftColor: t.color }}
          >
            <div
              className="lm-task-dot"
              style={{
                borderColor: t.color,
                background: t.done ? t.color : "transparent",
              }}
            />
            <span className="lm-task-time">{t.time}</span>
            <span className="lm-task-name">{t.name}</span>
          </div>
        ))}
        <div className="lm-notes">
          <span className="lm-notes-label">Заметки</span>
          <span className="lm-notes-text">Позвонить маме вечером…</span>
        </div>
      </div>
    </div>
  );
}

function GoalsMockup() {
  const goals = [
    { name: "Выучить испанский", progress: 55, stages: "5 из 9", color: "#9B7BE8" },
    { name: "Прочитать 12 книг", progress: 33, stages: "4 из 12", color: "#F0B36A" },
    { name: "Запустить сайт", progress: 80, stages: "8 из 10", color: "#5FD6C0" },
  ];

  return (
    <div className="lm-card">
      <div className="lm-card-top">
        <span className="lm-card-top-title">Мои цели</span>
      </div>
      <div className="lm-goals">
        {goals.map((g) => (
          <div key={g.name} className="lm-goal">
            <div className="lm-goal-top-row">
              <span className="lm-goal-name">{g.name}</span>
              <span className="lm-goal-pct" style={{ color: g.color }}>{g.progress}%</span>
            </div>
            <div className="lm-goal-track">
              <div
                className="lm-goal-fill"
                style={{ width: `${g.progress}%`, background: g.color }}
              />
            </div>
            <span className="lm-goal-meta">Этапы: {g.stages}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxMockup() {
  const items = [
    { name: "Купить молоко", tag: "Личное", tagColor: false },
    { name: "Ответить Дмитрию", tag: "Работа", tagColor: true },
    { name: "Записаться к врачу", tag: "Личное", tagColor: false },
    { name: "Оплатить счета", tag: "Личное", tagColor: false },
    { name: "Созвониться с командой", tag: "Работа", tagColor: true },
  ];

  return (
    <div className="lm-card">
      <div className="lm-card-top">
        <span className="lm-card-top-title">Входящие</span>
        <span className="lm-inbox-count">5 задач</span>
      </div>
      <div className="lm-inbox">
        {items.map((item, i) => (
          <div key={i} className="lm-inbox-row">
            <div className="lm-inbox-circle" />
            <span className="lm-inbox-name">{item.name}</span>
            <span className={`lm-inbox-tag${item.tagColor ? " lm-inbox-tag--work" : ""}`}>
              {item.tag}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing">
      <div className="landing-orb landing-orb--1" />
      <div className="landing-orb landing-orb--2" />
      <div className="landing-orb landing-orb--3" />

      <div className="landing-content">
        <nav className="landing-nav">
          <div className="landing-logo-group">
            <LogoIcon />
            <span className="landing-logo-name">Планировщик</span>
          </div>
          <Link to="/login" className="landing-nav-login">Войти</Link>
        </nav>

        <section className="landing-hero">
          <div className="landing-hero-badge">Бесплатно и без рекламы</div>
          <h1 className="landing-headline">
            Всё под контролем.<br />Каждый&nbsp;день.
          </h1>
          <p className="landing-subtext">
            Планируй задачи, отслеживай цели и никогда не теряй<br className="landing-br" /> важное из виду.
          </p>
          <div className="landing-cta-group">
            <Link to="/register" className="landing-btn-primary">Начать бесплатно</Link>
            <Link to="/login" className="landing-btn-ghost">Уже есть аккаунт</Link>
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-section-text">
            <span className="landing-section-label">Расписание</span>
            <h2 className="landing-section-h2">День и неделя — всегда под рукой</h2>
            <p className="landing-section-desc">
              Составляй расписание с временными блоками, используй шаблоны для повторяющихся дней и никогда не забывай о важных задачах.
            </p>
            <ul className="landing-points">
              <li>Временные слоты для каждой задачи</li>
              <li>Шаблоны дней и недель</li>
              <li>Перенос незавершённых задач</li>
              <li>Заметки к каждому дню</li>
            </ul>
          </div>
          <div className="landing-section-visual">
            <DayMockup />
          </div>
        </section>

        <section className="landing-section landing-section--reverse">
          <div className="landing-section-text">
            <span className="landing-section-label">Цели</span>
            <h2 className="landing-section-h2">Большие цели — маленькими шагами</h2>
            <p className="landing-section-desc">
              Ставь долгосрочные цели, разбивай их на конкретные этапы и наблюдай, как прогресс накапливается день за днём.
            </p>
            <ul className="landing-points">
              <li>Визуальный прогресс по каждой цели</li>
              <li>Этапы с дедлайнами</li>
              <li>Цели недели прямо на главной</li>
            </ul>
          </div>
          <div className="landing-section-visual">
            <GoalsMockup />
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-section-text">
            <span className="landing-section-label">Входящие</span>
            <h2 className="landing-section-h2">Собери всё в одном месте</h2>
            <p className="landing-section-desc">
              Записывай задачи во «Входящие» — не думая о расписании. Потом распредели их по дням в пару кликов.
            </p>
            <ul className="landing-points">
              <li>Быстрое добавление без даты</li>
              <li>Категории и приоритеты</li>
              <li>Перенос в расписание дня</li>
            </ul>
          </div>
          <div className="landing-section-visual">
            <InboxMockup />
          </div>
        </section>

        <section className="landing-bottom-cta">
          <h2 className="landing-bottom-h2">Начни планировать прямо сейчас</h2>
          <p className="landing-bottom-sub">Регистрация занимает меньше минуты</p>
          <Link to="/register" className="landing-btn-primary landing-btn-primary--lg">
            Начать бесплатно
          </Link>
        </section>
      </div>
    </div>
  );
}
