import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
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

export default function StatisticsPage() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    ? [...data.tasks.by_category].sort((a, b) => b.total - a.total).slice(0, 8)
    : [];
  const catMax = categories[0]?.total || 1;

  const chartData = (data?.tasks?.by_day ?? []).slice(-60).map((d) => ({
    date: fmtDate(d.date),
    completed: d.completed,
    total: d.total,
    remaining: Math.max(0, (d.total || 0) - (d.completed || 0)),
  }));

  const barInterval =
    period <= 7 ? 0 : period <= 30 ? 4 : 13;
  const barSize = period <= 7 ? 28 : period <= 30 ? 12 : 5;

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
                            tick={{ fontSize: 11, fill: "#9a92b6" }}
                            interval={barInterval}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: "#9a92b6" }}
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
                            contentStyle={{
                              borderRadius: 12,
                              border: "1px solid #ece6ff",
                              fontSize: 13,
                            }}
                          />
                          <Bar
                            dataKey="completed"
                            stackId="day"
                            fill="#7d68c9"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="remaining"
                            stackId="day"
                            fill="#d8cef1"
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
                    <h3 className="stats-section-title">По категориям</h3>
                    <div className="stats-category-list">
                      {categories.map((cat) => {
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
                              <span className="stats-cat-title">
                                {cat.title}
                              </span>
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
                                  width: `${Math.round(
                                    (volPct * donePct) / 100
                                  )}%`,
                                  background: cat.color || "#bbb",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
