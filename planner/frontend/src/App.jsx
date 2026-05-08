import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
} from "react-router-dom";
import FeedbackPage from "./pages/feedback/FeedbackPage";
import DayOverview from "./components/planning/day/DayOverview";
import MonthCalendar from "./components/planning/month/MonthCalendar";
import WeekPlannerPage from "./pages/planning/WeekPlannerPage";
import WeekPlan from "./components/planning/week/week_plan";
import Targets from "./components/goals/Targets";
import DayPlannerPage from "./pages/planning/DayPlannerPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import AboutPage from "./pages/about/AboutPage";
import FeedbackInboxPage from "./pages/feedback/FeedbackInboxPage";
import NotificationSendPage from "./pages/notifications/NotificationSendPage";
import { fetchMe, getToken, removeToken } from "./api/auth";
import "./index.css";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import GoalsPage from "./pages/goals/GoalsPage";
import NotificationsBell from "./components/NotificationsBell";
import AccountPage from "./pages/account/AccountPage";
import StatisticsPage from "./pages/statistics/StatisticsPage";

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getAvatarStyle(avatar) {
  if (!avatar?.startsWith("preset:")) {
    return {};
  }

  const [, , colorA, colorB] = avatar.split(":");
  return {
    background: `linear-gradient(135deg, ${colorA}, ${colorB})`,
  };
}

function UserAvatar({ user }) {
  const avatar = user?.avatar;

  if (avatar && !avatar.startsWith("preset:")) {
    return (
      <div className="side-menu-avatar side-menu-avatar--image">
        <img src={avatar} alt="" />
      </div>
    );
  }

  return (
    <div className="side-menu-avatar" style={getAvatarStyle(avatar)}>
      {(user?.username || user?.email || "U").slice(0, 1).toUpperCase()}
    </div>
  );
}

const Home = ({ user, onLogout }) => {
  const [selectedDay, setSelectedDay] = React.useState(() =>
    formatLocalDate(new Date())
  );
  const [menuOpen, setMenuOpen] = React.useState(false);

  const selectedDate = React.useMemo(
    () => parseLocalDate(selectedDay),
    [selectedDay]
  );

  const now = new Date();
  const dateString = now.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeString = now.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="app-wrapper">
      {menuOpen && (
        <div
          className="side-menu-backdrop"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className={`side-menu ${menuOpen ? "open" : ""}`}>
        <div className="side-menu-header">
          <div className="side-menu-user-block">
            <UserAvatar user={user} />

            <div className="side-menu-user-info">
              <div className="side-menu-user-name">
                {user?.username || "Пользователь"}
              </div>
              <div className="side-menu-user-email">{user?.email}</div>
            </div>
          </div>

          <button
            type="button"
            className="side-menu-close"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
        </div>

        <nav className="side-menu-nav">
          <Link to="/statistics" onClick={() => setMenuOpen(false)}>
            Статистика
          </Link>
<Link to="/about" onClick={() => setMenuOpen(false)}>
            О нас
          </Link>
<Link to="/account" onClick={() => setMenuOpen(false)}>
            Аккаунт
          </Link>

          <Link to="/feedback" onClick={() => setMenuOpen(false)}>
            Обратная связь
          </Link>

          {user?.role === "developer" && (
            <>
              <Link to="/notifications/send" onClick={() => setMenuOpen(false)}>
                Отправка уведомлений
              </Link>

              <Link to="/feedback-inbox" onClick={() => setMenuOpen(false)}>
                Отзывы пользователей
              </Link>
            </>
          )}
        </nav>

        <div className="side-menu-footer">
          <button
            type="button"
            className="side-menu-logout"
            onClick={onLogout}
          >
            Выйти
          </button>
        </div>
      </aside>

      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <button
              type="button"
              className="menu-trigger-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Открыть меню"
            >
              <div className="icon-circle">
                <svg width="24" height="18" viewBox="0 0 24 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="24" height="3" rx="1.5" fill="#7b5ecf"/>
                  <rect y="7.5" width="24" height="3" rx="1.5" fill="#7b5ecf"/>
                  <rect y="15" width="24" height="3" rx="1.5" fill="#7b5ecf"/>
                </svg>
              </div>
            </button>
          </div>

          <div className="app-header-center">
            {dateString.toUpperCase()} &nbsp; {timeString}
          </div>

          <div className="app-header-right">
            <NotificationsBell user={user} />
          </div>
        </header>

        <main className="app-main">
          <section className="card day-card">
            <div className="card-header-row">
              <h2>Расписание на день</h2>
              <Link
                to={`/day-plan?date=${selectedDay}`}
                className="day-open-link"
              >
                Открыть
              </Link>
            </div>

            <DayOverview selectedDay={selectedDay} />
          </section>

          <section className="card month-card">
            <h2>Расписание на месяц</h2>
            <MonthCalendar
              selectedDate={selectedDate}
              onDateChange={(date) => setSelectedDay(formatLocalDate(date))}
            />
          </section>

          <section className="card week-card">
            <div className="card-header-row">
              <h2>Расписание на неделю</h2>
              <Link
                to={`/week-plan?date=${selectedDay}`}
                className="day-open-link"
              >
                Открыть
              </Link>
            </div>

            <WeekPlan selectedDate={selectedDate} />
          </section>

          <section className="card targets-card">
            <h2>Цели</h2>
            <Targets />
          </section>
        </main>
      </div>
    </div>
  );
};

function ProtectedRoute({ isAuthenticated, children }) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function DeveloperRoute({ isAuthenticated, user, children }) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== "developer") {
    return <Navigate to="/" replace />;
  }

  return children;
}

const App = () => {
  const [authChecked, setAuthChecked] = React.useState(false);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    const token = getToken();

    if (!token) {
      setIsAuthenticated(false);
      setUser(null);
      setAuthChecked(true);
      return;
    }

    fetchMe(token)
      .then((userData) => {
        setIsAuthenticated(true);
        setUser(userData);
      })
      .catch(() => {
        removeToken();
        setIsAuthenticated(false);
        setUser(null);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  function handleLogout() {
    removeToken();
    setIsAuthenticated(false);
    setUser(null);
    window.location.href = "/login";
  }

  if (!authChecked) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>Загрузка...</h2>
          <div className="auth-footer">Проверяем авторизацию</div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
          }
        />

        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route
          path="/register"
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <Home user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/goals"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <GoalsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/statistics"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <StatisticsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/account"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <AccountPage user={user} onUserUpdate={setUser} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/notifications/send"
          element={
            <DeveloperRoute
              isAuthenticated={isAuthenticated}
              user={user}
            >
              <NotificationSendPage />
            </DeveloperRoute>
          }
        />

        <Route
          path="/about"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <AboutPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/feedback"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <FeedbackPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/feedback-inbox"
          element={
            <DeveloperRoute
              isAuthenticated={isAuthenticated}
              user={user}
            >
              <FeedbackInboxPage />
            </DeveloperRoute>
          }
        />

        <Route
          path="/day-plan"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <DayPlannerPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/week-plan"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <WeekPlannerPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
