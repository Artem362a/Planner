import { useEffect, useState } from "react";
import { fetchDailySuccessesSummary } from "../../api/dailySuccesses";
import { CategoryIcon } from "../../components/icons";
import SuccessesDistribution from "./SuccessesDistribution";

function plural(value, forms) {
  const mod100 = value % 100, mod10 = value % 10;
  return forms[mod100 >= 11 && mod100 <= 14 ? 2 : mod10 === 1 ? 0 : mod10 >= 2 && mod10 <= 4 ? 1 : 2];
}

export default function SuccessesSummary({ startDate, endDate, categoryIds, onCategoryToggle }) {
  const [response, setResponse] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const matchesPeriod = response && response.startDate === startDate && response.endDate === endDate;
  const data = matchesPeriod ? response.data : null;
  const error = matchesPeriod ? response.error : "";
  const loading = !matchesPeriod;

  useEffect(() => {
    let active = true;
    fetchDailySuccessesSummary({ startDate, endDate })
      .then(data => { if (active) setResponse({ startDate, endDate, data, error: "" }); })
      .catch(err => { if (active) setResponse({ startDate, endDate, data: null, error: err.message }); });
    return () => { active = false; };
  }, [startDate, endDate]);

  const directions = expanded ? data?.categories : data?.categories.slice(0, 6);
  if (!loading && !error && data?.total === 0) return null;
  return <section className="successes-summary" aria-label="Сводка успехов по категориям">
    <div className="successes-summary-heading">
      <h2>По категориям</h2>
      {data?.total > 0 && <span>{data.total} {plural(data.total, ["запись", "записи", "записей"])} · {data.days} {plural(data.days, ["день", "дня", "дней"])}</span>}
    </div>
    {loading && <p className="successes-empty" role="status">Загружаем сводку…</p>}
    {error && <p className="successes-error" role="alert">{error}</p>}
    {!loading && !error && data?.total > 0 && <SuccessesDistribution data={data} recordsLabel={plural(data.total, ["запись", "записи", "записей"])} />}
    {!loading && !error && data?.total > 0 && <div className="successes-directions">{directions.map(row => {
      const value = row.category ? String(row.category.id) : "none";
      const title = row.category?.title || "Без категории";
      const description = `${title}: ${row.total} ${plural(row.total, ["запись", "записи", "записей"])}, ${row.days} ${plural(row.days, ["день", "дня", "дней"])}`;
      return <button type="button" key={value} className="success-direction" aria-pressed={categoryIds.includes(value)}
        aria-label={description} title={description}
        onClick={() => onCategoryToggle(value)} style={{ "--success-color": row.category?.color || "var(--text-muted)" }}>
        <span className="success-journal-icon"><CategoryIcon name={row.category?.icon || "tag"} /></span>
        <span className="success-direction-title">{title}</span>
        <span className="success-direction-count" aria-hidden="true">{row.total}</span>
      </button>;
    })}
      {data.categories.length > 6 && <button type="button" className="successes-directions-toggle" aria-expanded={expanded}
        onClick={() => setExpanded(previous => !previous)}>{expanded ? "Свернуть" : `Ещё ${data.categories.length - 6}`}</button>}
    </div>}
  </section>;
}
