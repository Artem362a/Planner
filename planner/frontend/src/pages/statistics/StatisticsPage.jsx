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
  { label: "Всё время", value: "all" },
];

function fmtDate(iso) {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function fmtDuration(value) {
  const totalMinutes = Math.max(0, Number(value) || 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours} ч ${minutes} мин`;
  if (hours) return `${hours} ч`;
  return `${minutes} мин`;
}

function toIsoDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return toIsoDate(new Date());
}

function shiftIsoDate(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + days);
  return toIsoDate(value);
}

function fmtPeriodDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function fmtMonth(iso) {
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    year: "2-digit",
  }).format(new Date(year, month - 1, 1));
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
  const [windowEnd, setWindowEnd] = useState(todayIso);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [catView, setCatView] = useState("bars");
  const [catMetric, setCatMetric] = useState("tasks");
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

  function changePeriod(value) {
    const currentEnd = todayIso();
    if (value === period && (value === "all" || windowEnd === currentEnd)) return;
    setLoading(true);
    setError(null);
    setPeriod(value);
    setWindowEnd(currentEnd);
  }

  function shiftPeriod(direction) {
    if (period === "all") return;
    const currentEnd = todayIso();
    const shiftedEnd = shiftIsoDate(windowEnd, direction * period);
    setLoading(true);
    setError(null);
    setWindowEnd(shiftedEnd > currentEnd ? currentEnd : shiftedEnd);
  }

  useEffect(() => {
    let active = true;
    fetchStatistics(typeof period === "number" ? period : 30, {
      endDate: windowEnd,
      allTime: period === "all",
    })
      .then((result) => { if (active) setData(result); })
      .catch((e) => { if (active) setError(e.message || "Ошибка"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, windowEnd]);

  const completed = data?.tasks?.completed ?? "—";
  const rate =
    data?.tasks?.completion_rate != null
      ? `${data.tasks.completion_rate}%`
      : "—";
  const streak = data?.streak?.current ?? "—";
  const bestDay = data?.best_day
    ? `${fmtDate(data.best_day.date)} (${data.best_day.completed})`
    : "—";
  const periodCaption = period === "all"
    ? "За всё время"
    : data?.period
      ? `${fmtPeriodDate(data.period.start)} — ${fmtPeriodDate(data.period.end)}`
      : "";
  const isCurrentPeriod = windowEnd >= todayIso();

  const highTotal = data?.tasks?.by_priority?.high?.total ?? 0;
  const medTotal = data?.tasks?.by_priority?.medium?.total ?? 0;
  const prioritySum = highTotal + medTotal;
  const highPct =
    prioritySum > 0 ? Math.round((highTotal / prioritySum) * 100) : 0;

  const categoryTotalKey = catMetric === "time" ? "planned_min" : "total";
  const categoryCompletedKey = catMetric === "time" ? "completed_min" : "completed";
  const categories = Array.isArray(data?.tasks?.by_category)
    ? [...data.tasks.by_category].sort(
        (a, b) => (b[categoryTotalKey] || 0) - (a[categoryTotalKey] || 0),
      )
    : [];
  const visibleCategories = categories.filter((c) => !hiddenCats.has(c.key));
  const catMax = Math.max(
    1,
    ...visibleCategories.map((cat) => cat[categoryTotalKey] || 0),
  );

  const activityByMonth = (data?.period?.days || 0) > 90;
  const dailyActivity = data?.tasks?.by_day ?? [];
  const chartData = activityByMonth
    ? Object.values(dailyActivity.reduce((months, day) => {
        const key = day.date.slice(0, 7);
        if (!months[key]) {
          months[key] = { date: fmtMonth(key), completed: 0, total: 0 };
        }
        months[key].completed += day.completed || 0;
        months[key].total += day.total || 0;
        return months;
      }, {})).map((month) => ({
        ...month,
        remaining: Math.max(0, month.total - month.completed),
      }))
    : dailyActivity.map((day) => ({
        date: fmtDate(day.date),
        completed: day.completed,
        total: day.total,
        remaining: Math.max(0, (day.total || 0) - (day.completed || 0)),
      }));

  const barInterval = chartData.length <= 10
    ? 0
    : Math.max(0, Math.ceil(chartData.length / 7) - 1);
  const barSize = chartData.length <= 10 ? 28 : chartData.length <= 35 ? 12 : 5;

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
            <div className="stats-period-toolbar">
              <div className="stats-period-row">
                {PERIOD_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`stats-period-pill${
                      period === o.value ? " stats-period-pill--active" : ""
                    }`}
                    onClick={() => changePeriod(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="stats-period-navigation">
                <button
                  type="button"
                  className="stats-period-arrow"
                  onClick={() => shiftPeriod(-1)}
                  disabled={period === "all"}
                  aria-label="Предыдущий период"
                  title="Предыдущий период"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m12.5 5-5 5 5 5" />
                  </svg>
                </button>
                <span className="stats-period-caption">{periodCaption}</span>
                <button
                  type="button"
                  className="stats-period-arrow"
                  onClick={() => shiftPeriod(1)}
                  disabled={period === "all" || isCurrentPeriod}
                  aria-label="Следующий период"
                  title="Следующий период"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m7.5 5 5 5-5 5" />
                  </svg>
                </button>
              </div>
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
                    <h3 className="stats-section-title">
                      Активность по {activityByMonth ? "месяцам" : "дням"}
                    </h3>
                    <div className="stats-chart-wrap">
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart
                          data={chartData}
                          margin={{ top: 8, right: 2, left: 2, bottom: 0 }}
                          barSize={barSize}
                        >
                          <XAxis
                            dataKey="date"
                            tick={chartTick}
                            interval={barInterval}
                            axisLine={false}
                            tickLine={false}
                            height={22}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={chartTick}
                            axisLine={false}
                            tickLine={false}
                            width={28}
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

                    <div className="stats-metric-toggle" role="group" aria-label="Показатель по категориям">
                      <button
                        type="button"
                        className={`stats-metric-btn${catMetric === "tasks" ? " stats-metric-btn--active" : ""}`}
                        onClick={() => setCatMetric("tasks")}
                        aria-pressed={catMetric === "tasks"}
                      >
                        Задачи
                      </button>
                      <button
                        type="button"
                        className={`stats-metric-btn${catMetric === "time" ? " stats-metric-btn--active" : ""}`}
                        onClick={() => setCatMetric("time")}
                        aria-pressed={catMetric === "time"}
                      >
                        Время
                      </button>
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
                        {visibleCategories.length < categories.length && (
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
                            value: Math.sqrt(cat[categoryCompletedKey] || 0),
                            raw: cat[categoryCompletedKey] || 0,
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
                            formatter={(v, name, item) => [
                              catMetric === "time"
                                ? fmtDuration(item?.payload?.raw ?? v)
                                : item?.payload?.raw ?? v,
                              catMetric === "time"
                                ? "Время выполненных"
                                : name === "value" ? "Выполнено" : name,
                            ]}
                            contentStyle={chartTooltipStyle}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="stats-category-list">
                        {visibleCategories.map((cat) => {
                          const totalValue = cat[categoryTotalKey] || 0;
                          const completedValue = cat[categoryCompletedKey] || 0;
                          const volPct = Math.round((totalValue / catMax) * 100);
                          const donePct =
                            totalValue > 0
                              ? Math.round((completedValue / totalValue) * 100)
                              : 0;
                          return (
                            <div key={cat.key} className="stats-cat-row">
                              <div className="stats-cat-label">
                                <span
                                  className="stats-cat-dot"
                                  style={{ background: cat.color || "#bbb" }}
                                />
                                <span className="stats-cat-title">{cat.title}</span>
                                <span
                                  className="stats-cat-count"
                                  title={catMetric === "time" ? "Выполнено / запланировано" : "Выполнено / всего"}
                                >
                                  {catMetric === "time"
                                    ? `${fmtDuration(cat.completed_min)} / ${fmtDuration(cat.planned_min)}`
                                    : `${cat.completed}/${cat.total}`}
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

                  {data.goals?.stages?.total > 0 && (
                    <div className="stats-goals-stages-note">
                      Этапы закрыто: {data.goals.stages.done} из{" "}
                      {data.goals.stages.total}
                    </div>
                  )}

                  {(data.goals?.active_progress || []).length > 0 && (
                    <div className="stats-goals-sub">
                      <div className="stats-goals-subtitle stats-goals-subtitle--progress">
                        Прогресс по целям
                      </div>
                      <div className="stats-category-list">
                        {data.goals.active_progress.map((g) => {
                          const pct = g.total
                            ? Math.round((g.done / g.total) * 100)
                            : 0;
                          const color = g.color || "#7ECF8A";
                          return (
                            <div key={g.id} className="stats-cat-row">
                              <div className="stats-cat-label">
                                <span
                                  className="stats-cat-dot"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="stats-cat-title">
                                  {g.title}
                                </span>
                                <span className="stats-cat-count">
                                  {g.done}/{g.total} · {pct}%
                                </span>
                              </div>
                              <div className="stats-cat-track">
                                <div
                                  className="stats-cat-done"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: color,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(data.goals?.recurring_progress || []).length > 0 && (
                    <div className="stats-goals-sub">
                      <div className="stats-goals-subtitle">
                        Регулярные за период
                      </div>
                      <div className="stats-category-list">
                        {data.goals.recurring_progress.map((g) => {
                          const pct = g.applicable
                            ? Math.round((g.done / g.applicable) * 100)
                            : 0;
                          const color = g.color || "#7ECF8A";
                          return (
                            <div key={g.id} className="stats-cat-row">
                              <div className="stats-cat-label">
                                <span
                                  className="stats-cat-dot"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="stats-cat-title">
                                  {g.title}
                                </span>
                                <span className="stats-cat-count">
                                  {g.done}/{g.applicable}
                                  {g.streak > 0 ? ` · серия ${g.streak}` : ""}
                                </span>
                              </div>
                              <div className="stats-cat-track">
                                <div
                                  className="stats-cat-done"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: color,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
