import { useEffect, useRef, useState } from "react";
import { fetchDailySuccesses } from "../../api/dailySuccesses";
import { formatPlanDate } from "../../utils/dates";
import { CategoryIcon } from "../../components/icons";
import SuccessesSummary from "./SuccessesSummary";

export default function SuccessesHistory({ startDate, endDate }) {
  const [items, setItems] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef(null);

  useEffect(() => {
    const request = { active: true };
    activeRequest.current = request;
    setLoading(true); setLoadingMore(false); setError(""); setItems([]); setHasMore(false);
    fetchDailySuccesses({ startDate, endDate, categoryIds })
      .then(result => { if (request.active) { setItems(result.items); setHasMore(result.has_more); } })
      .catch(err => { if (request.active) setError(err.message); })
      .finally(() => { if (request.active) setLoading(false); });
    return () => { request.active = false; };
  }, [startDate, endDate, categoryIds]);

  function toggleCategory(id) {
    setCategoryIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  }

  async function loadMore() {
    const request = activeRequest.current;
    setLoadingMore(true); setError("");
    try {
      const result = await fetchDailySuccesses({ startDate, endDate, categoryIds, offset: items.length });
      if (request?.active) { setItems(previous => [...previous, ...result.items]); setHasMore(result.has_more); }
    } catch (err) { if (request?.active) setError(err.message); }
    finally { if (request?.active) setLoadingMore(false); }
  }

  const days = Object.entries(items.reduce((groups, item) => {
    (groups[item.day] ||= []).push(item);
    return groups;
  }, {}));

  return <section className="successes-history">
    <SuccessesSummary startDate={startDate} endDate={endDate} categoryIds={categoryIds} onCategoryToggle={toggleCategory} />
    <div className="successes-history-heading"><h2>По дням</h2></div>
    {error && <p role="alert" className="successes-error">{error}</p>}
    {loading ? <p role="status" className="successes-empty">Загружаем успехи…</p> : !items.length && !error ? <p className="successes-empty">За этот период нет записей{categoryIds.length ? " в выбранных категориях" : ""}.</p> : null}
    {!loading && <div className="success-journal">{days.map(([day, entries]) => <section className="success-journal-day" key={day} aria-label={`Успехи за ${formatPlanDate(day, { year: "numeric" })}`}>
      <div className="success-journal-day-heading">
        <h3 className="success-journal-date"><time dateTime={day}>{formatPlanDate(day, { year: "numeric" })}</time></h3>
        <span className="success-journal-weekday">{new Date(`${day}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "long" })}</span>
      </div>
      <ul className="success-journal-entries">{entries.map(item => <li className="success-journal-entry" key={item.id} style={{ "--success-color": item.category?.color || "var(--accent)" }}>
        <span className="success-journal-icon"><CategoryIcon name={item.category?.icon || "tag"} /></span>
        <div className="success-journal-text"><p>{item.text}</p><span className="success-journal-category">{item.category?.title || "Без категории"}</span></div>
      </li>)}</ul>
    </section>)}</div>}
    {!loading && hasMore && <button className="secondary-btn" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Загружаем…" : "Показать ещё"}</button>}
  </section>;
}
