import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import { fetchStatistics } from "../../api/statistics";
import "../../styles/pages/statistics.css";

const PERIOD_OPTIONS = [
  { label: "7 дней", value: 7 },
  { label: "30 дней", value: 30 },
  { label: "3 месяца", value: 90 },
  { label: "Год", value: 365 },
];

function fmtDate(iso) {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

const HIDDEN_CATS_KEY = "stats.hiddenCategories";

function loadHiddenCats() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_CATS_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

export default function StatisticsPage() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catView, setCatView] = useState("bars");
  const [hiddenCats, setHiddenCats] = useState(loadHiddenCats);

  const toggleCat = (key) => {
    setHiddenCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(HIDDEN_CATS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const showAllCats = () => {
    setHiddenCats(new Set());
    localStorage.setItem(HIDDEN_CATS_KEY, "[]");
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStatistics(period)
      .then(setData)
      .catch((e) => setError(e.message || "Ошибка"))
      .finally(() => setLoading(false));
  }, [period]);

  const completed = data?.tasks?.completed ?? "—";
  const rate =
    data?.tasks?.completion_rate != null
      ? `${data.tasks.completion_rate}%`
      : "—";
  const streak = data?.streak?.current ?? "—";
  const bestDay = data?.best_day
    ? `${fmtDate(data.best_day.date)} (${data.best_day.completed})`
    : "—";

  const highTotal = data?.tasks?.by_priority?.high?.total ?? 0;
  const medTotal = data?.tasks?.by_priority?.medium?.total ?? 0;
  const prioritySum = highTotal + medTotal;
  const highPct =
    prioritySum > 0 ? Math.round((highTotal / prioritySum) * 100) : 0;

  const categories = Array.isArray(data?.tasks?.by_category)
    ? [...data.tasks.by_category].sort((a, b) => b.total - a.total)
    : [];
  const visibleCategories = categories.filter((c) => !hiddenCats.has(c.key));
  const catMax = visibleCategories[0]?.total || 1;

  const chartData = (data?.tasks?.by_day ?? []).slice(-60).map((d) => ({
    date: fmtDate(d.date),
    completed: d.completed,
    total: d.total,
    remaining: Math.max(0, (d.total || 0) - (d.completed || 0)),
  }));

  const barInterval =
    period <= 7 ? 0 : period <= 30 ? 4 : 13;
  const barSize = period <= 7 ? 28 : period <= 30 ? 12 : 5;

  // Recharts colors live in JSX, not CSS, so pick them per theme.
  const isDark =
    document.documentElement.getAttribute("data-theme") === "dark";
  const chartDone = isDark ? "#8f7ae0" : "#7d68c9";
  const chartRemaining = isDark ? "#33303f" : "#d8cef1";
  const chartTick = { fontSize: 11, fill: isDark ? "#8f8a9e" : "#9a92b6" };
  const chartTooltipStyle = {
    borderRadius: 12,
    border: `1px solid ${isDark ? "#33313f" : "#ece6ff"}`,
    fontSize: 13,
    ...(isDark ? { background: "#1d1c24", color: "#e4e2ed" } : {}),
  };

  return (
    <div className="app-wrapper">
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <Link to="/" className="feedback-back-link">
              ← Назад
            </Link>
          </div>
          <div className="app-header-center">СТАТИСТИКА</div>
          <div className="app-header-right" />
        </header>

        <main className="day-page-main">
          <div className="day-big-card stats-shell-card">

            {/* Period selector */}
            <div className="stats-period-row">
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`stats-period-pill${
                    period === o.value ? " stats-period-pill--active" : ""
                  }`}
                  onClick={() => setPeriod(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {loading && (
              <div className="day-task-empty">Загрузка статистики...</div>
            )}

            {error && (
              <div className="day-task-empty" style={{ color: "#d36b6b" }}>
                {error}
              </div>
            )}

            {!loading && !error && data && (
              <>
                {/* KPI cards */}
                <div className="stats-cards-row">
                  {[
                    { value: completed, label: "Задач выполнено", mod: "" },
                    {
                      value: rate,
                      label: "% выполнения",
                      mod: " stats-card-value--green",
                    },
                    {
                      value: streak,
                      label: "Текущий стрик",
                      mod: " stats-card-value--purple",
                    },
                    { value: bestDay, label: "Лучший день", mod: "" },
                  ].map(({ value, label, mod }) => (
                    <div key={label} className="stats-card">
                      <div className={`stats-card-value${mod}`}>{value}</div>
                      <div className="stats-card-label">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Activity chart */}
                {chartData.length > 0 && (
                  <div className="stats-section">
                    <h3 className="stats-section-title">Активность по дням</h3>
                    <div className="stats-chart-wrap">
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart
                          data={chartData}
                          margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                          barSize={barSize}
                        >
                          <XAxis
                            dataKey="date"
                            tick={chartTick}
                            interval={barInterval}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={chartTick}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            formatter={(v, n) => [
                              v,
                              n === "completed"
                                ? "Выполнено"
                                : n === "remaining"
                                ? "Не выполнено"
                                : n,
                            ]}
                            labelFormatter={(label, payload) => {
                              const total = payload?.[0]?.payload?.total ?? 0;
                              return `${label} · всего: ${total}`;
                            }}
                            cursor={{
                              fill: "rgba(125, 104, 201, 0.12)",
                              radius: 4,
                            }}
                            contentStyle={chartTooltipStyle}
                          />
                          <Bar
                            dataKey="completed"
                            stackId="day"
                            fill={chartDone}
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="remaining"
                            stackId="day"
                            fill={chartRemaining}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Categories */}
                {categories.length > 0 && (
                  <div className="stats-section">
                    <div className="stats-section-header">
                      <h3 className="stats-section-title">По категориям</h3>
                      {categories.length >= 3 && (
                        <div className="stats-view-toggle">
                          <button
                            type="button"
                            className={`stats-view-btn${catView === "bars" ? " stats-view-btn--active" : ""}`}
                            onClick={() => setCatView("bars")}
                          >
                            ≡
                          </button>
                          <button
                            type="button"
                            className={`stats-view-btn${catView === "radar" ? " stats-view-btn--active" : ""}`}
                            onClick={() => setCatView("radar")}
                          >
                            ◎
                          </button>
                        </div>
                      )}
                    </div>

                    {categories.length > 1 && (
                      <div className="stats-cat-chips">
                        {categories.map((cat) => {
                          const hidden = hiddenCats.has(cat.key);
                          return (
                            <button
                              key={cat.key}
                              type="button"
                              className={`stats-cat-chip${hidden ? " stats-cat-chip--off" : ""}`}
                              onClick={() => toggleCat(cat.key)}
                              title={hidden ? "Показать в статистике" : "Скрыть из статистики"}
                            >
                              <span
                                className="stats-cat-dot"
                                style={{ background: cat.color || "#bbb" }}
                              />
                              {cat.title}
                            </button>
                          );
                        })}
                        {hiddenCats.size > 0 && (
                          <button
                            type="button"
                            className="stats-cat-chip stats-cat-chip--reset"
                            onClick={showAllCats}
                          >
                            Показать все
                          </button>
                        )}
                      </div>
                    )}

                    {catView === "radar" && visibleCategories.length >= 3 ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <RadarChart
                          data={visibleCategories.map((cat) => ({
                            subject: cat.title,
                            // sqrt-шкала: иначе пара крупных категорий
                            // прижимает остальные оси к центру
                            value: Math.sqrt(cat.completed),
                            raw: cat.completed,
                          }))}
                          margin={{ top: 16, right: 40, bottom: 16, left: 40 }}
                        >
                          <PolarGrid stroke={isDark ? "#33313f" : "#3a2f5e"} />
                          <PolarAngleAxis
                            dataKey="subject"
                            tick={{ ...chartTick, fontSize: 12 }}
                          />
                          <Radar
                            dataKey="value"
                            stroke={chartDone}
                            fill={chartDone}
                            fillOpacity={0.35}
                          />
                          <Tooltip
                            formatter={(v, n, item) => [
                              item?.payload?.raw ?? v,
                              "Выполнено",
                            ]}
                            contentStyle={chartTooltipStyle}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="stats-category-list">
                        {visibleCategories.map((cat) => {
                          const volPct = Math.round((cat.total / catMax) * 100);
                          const donePct =
                            cat.total > 0
                              ? Math.round((cat.completed / cat.total) * 100)
                              : 0;
                          return (
                            <div key={cat.key} className="stats-cat-row">
                              <div className="stats-cat-label">
                                <span
                                  className="stats-cat-dot"
                                  style={{ background: cat.color || "#bbb" }}
                                />
                                <span className="stats-cat-title">{cat.title}</span>
                                <span className="stats-cat-count">
                                  {cat.completed}/{cat.total}
                                </span>
                              </div>
                              <div className="stats-cat-track">
                                <div
                                  className="stats-cat-vol"
                                  style={{
                                    width: `${volPct}%`,
                                    background: cat.color || "#bbb",
                                  }}
                                />
                                <div
                                  className="stats-cat-done"
                                  style={{
                                    width: `${Math.round((volPct * donePct) / 100)}%`,
                                    background: cat.color || "#bbb",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Priority */}
                {prioritySum > 0 && (
                  <div className="stats-section">
                    <h3 className="stats-section-title">По приоритету</h3>
                    <div className="stats-priority-bar">
                      <div
                        className="stats-priority-seg--high"
                        style={{ width: `${highPct}%` }}
                      />
                      <div
                        className="stats-priority-seg--medium"
                        style={{ width: `${100 - highPct}%` }}
                      />
                    </div>
                    <div className="stats-priority-legend">
                      <span className="stats-priority-item">
                        <span className="stats-pdot stats-pdot--high" />
                        Высокий — {highTotal} ({highPct}%)
                      </span>
                      <span className="stats-priority-item">
                        <span className="stats-pdot stats-pdot--medium" />
                        Средний — {medTotal} ({100 - highPct}%)
                      </span>
                    </div>
                  </div>
                )}

                {/* Goals */}
                <div className="stats-section">
                  <h3 className="stats-section-title">Цели</h3>
                  <div className="stats-goals-row">
                    <div className="stats-goals-box stats-goals-box--active">
                      <div className="stats-goals-val">
                        {data.goals?.active ?? 0}
                      </div>
                      <div className="stats-goals-lbl">Активные</div>
                    </div>
                    <div className="stats-goals-box stats-goals-box--done">
                      <div className="stats-goals-val">
                        {data.goals?.done ?? 0}
                      </div>
                      <div className="stats-goals-lbl">Завершены</div>
                    </div>
                    <div className="stats-goals-box stats-goals-box--archived">
                      <div className="stats-goals-val">
                        {data.goals?.archived ?? 0}
                      </div>
                      <div className="stats-goals-lbl">В архиве</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
