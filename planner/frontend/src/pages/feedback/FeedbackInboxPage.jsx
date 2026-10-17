import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFeedbackList, updateFeedbackStatus, replyToFeedback } from "../../api/feedback";
import CategoryPicker from "../../components/forms/CategoryPicker";
import { FEEDBACK_CATEGORIES, FEEDBACK_TYPES, FEEDBACK_STATUSES, filterFeedback } from "../../utils/feedback";
import { formatUtcDateTime, parseUtcDate } from "../../utils/dates";

export default function FeedbackInboxPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ status: "active", category: "Все", type: "Все", query: "", unanswered: false });
  const [sort, setSort] = useState("newest");
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [replyDrafts, setReplyDrafts] = useState({});

  async function loadFeedback() {
    setLoading(true); setError("");
    try {
      const data = await fetchFeedbackList();
      const list = Array.isArray(data) ? data : [];
      setItems(list); setSelected([]);
      setReplyDrafts(prev => Object.fromEntries(list.map(item => [item.id, prev[item.id] ?? item.developer_reply ?? ""])));
    } catch (err) { setError(err.message || "Не удалось загрузить обращения"); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadFeedback(); }, []);

  const categories = useMemo(() => [...new Set([...FEEDBACK_CATEGORIES, ...items.map(item => item.category).filter(Boolean)])], [items]);
  const types = useMemo(() => [...new Set([...FEEDBACK_TYPES, ...items.map(item => item.type).filter(Boolean)])], [items]);
  const shown = useMemo(() => filterFeedback(items, filters).sort((a, b) => {
    const difference = (parseUtcDate(b.created_at)?.getTime() || 0) - (parseUtcDate(a.created_at)?.getTime() || 0);
    return sort === "newest" ? difference || b.id - a.id : -difference || a.id - b.id;
  }), [items, filters, sort]);
  const page = shown.slice(0, limit);
  const stats = [
    { label: "Новые", count: items.filter(i => i.status === "new").length, status: "new" },
    { label: "В работе", count: items.filter(i => i.status === "in_progress").length, status: "in_progress" },
    { label: "Решённые", count: items.filter(i => i.status === "resolved").length, status: "resolved" },
    { label: "Без ответа", count: items.filter(i => !i.developer_reply?.trim()).length, status: "all", unanswered: true },
  ];
  function changeFilters(patch) {
    setFilters(prev => ({ ...prev, ...patch })); setLimit(20); setSelected([]); setNotice("");
  }
  function toggleSelection(id) { setSelected(prev => prev.includes(id) ? prev.filter(value => value !== id) : [...prev, id]); }
  async function changeStatus(ids, status) {
    if (busyRef.current || !ids.length) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const results = await Promise.allSettled(ids.map(id => updateFeedbackStatus(id, status)));
      const updated = new Map(results.filter(result => result.status === "fulfilled").map(result => [result.value.id, result.value]));
      const failed = ids.filter((_, index) => results[index].status === "rejected");
      setItems(prev => prev.map(item => updated.get(item.id) || item));
      setSelected(failed);
      if (failed.length) setError(`Не удалось обновить ${failed.length} обращений. Они остаются выделенными — можно повторить.`);
      setNotice(`Обновлено обращений: ${updated.size}`);
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function sendReply(item) {
    const reply = replyDrafts[item.id]?.trim();
    if (busyRef.current || !reply) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const updated = await replyToFeedback(item.id, reply);
      setItems(prev => prev.map(value => value.id === item.id ? updated : value));
      setReplyDrafts(prev => ({ ...prev, [item.id]: updated.developer_reply || "" }));
      setNotice(`Ответ на обращение #${item.id} отправлен`);
    } catch (err) { setError(err.message || "Не удалось отправить ответ"); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <div className="app-wrapper"><div className="app"><main className="day-page-main">
    <div className="feedback-page-card feedback-admin-card">
      <div className="feedback-page-topline"><Link to="/" className="feedback-back-link">← Назад</Link><span className="feedback-badge">Разработчик</span></div>
      <div className="ui-modal-heading"><div><h1 className="feedback-page-title">Обращения</h1><p className="feedback-page-subtitle">Всего {items.length}</p></div>
        <button type="button" className="secondary-btn" disabled={loading || busy} onClick={loadFeedback}>Обновить</button></div>
      <div className="feedback-dashboard admin-dashboard" role="group" aria-label="Фильтры обращений">{stats.map(stat => <button type="button" key={stat.label} className="feedback-stat-card" disabled={busy}
        aria-pressed={filters.status === stat.status && filters.unanswered === !!stat.unanswered}
        onClick={() => changeFilters({ status: stat.status, unanswered: !!stat.unanswered, category: "Все", type: "Все", query: "" })}>
        <span className="feedback-stat-label">{stat.label}</span><span className="feedback-stat-value">{stat.count}</span>
      </button>)}</div>
      <div className="ui-toolbar admin-filters">
        <label className="ui-search">Поиск<input type="search" placeholder="Текст, имя, контакт или номер" value={filters.query} disabled={busy} onChange={e => changeFilters({ query: e.target.value })} /></label>
        <label className="admin-filter-status">Статус<select value={filters.status} disabled={busy} onChange={e => changeFilters({ status: e.target.value })}>
          <option value="all">Все статусы</option><option value="active">Новые и в работе</option>{Object.entries(FEEDBACK_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Категория<CategoryPicker label="Категория обращения" value={filters.category} disabled={busy}
          options={[{ value: "Все", title: "Все категории" }, ...categories.map(title => ({ value: title, title }))]}
          onChange={category => changeFilters({ category })} /></label>
        <label>Тип<select value={filters.type} disabled={busy} onChange={e => changeFilters({ type: e.target.value })}><option>Все</option>{types.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="admin-filter-order">Порядок<select value={sort} disabled={busy} onChange={e => { setSort(e.target.value); setLimit(20); setSelected([]); }}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option></select></label>
        <label className="ui-checkbox"><input type="checkbox" checked={filters.unanswered} disabled={busy} onChange={e => changeFilters({ unanswered: e.target.checked })} />Без ответа</label>
      </div>
      {!loading && !!shown.length && <div className="admin-list-toolbar">
        <label className="ui-checkbox"><input type="checkbox" aria-label="Выбрать показанные обращения" disabled={busy} checked={page.length > 0 && page.every(item => selected.includes(item.id))}
          onChange={e => setSelected(e.target.checked ? page.map(item => item.id) : [])} />Выбрать все на странице</label>
        <span>Найдено: {shown.length}</span>
      </div>}
      {!loading && !!selected.length && <div className="admin-bulk-toolbar" role="group" aria-label="Действия с выбранными обращениями">
        <span>Выбрано: {selected.length}</span>
        {[["in_progress", "В работу"], ["resolved", "Решено"], ["new", "Вернуть в новые"]].map(([status, label]) => <button key={status} type="button" className="secondary-btn" disabled={busy || !selected.length} onClick={() => changeStatus(selected, status)}>{label}</button>)}
        <button type="button" className="ui-disclosure admin-clear-selection" disabled={busy} onClick={() => setSelected([])}>Снять выделение</button>
      </div>}
      {error && <div className="auth-error" role="alert">{error}</div>}{notice && <div className="feedback-success" role="status">{notice}</div>}
      {loading ? <p className="day-task-empty">Загрузка…</p> : !shown.length ? <p className="day-task-empty">По этим условиям обращений нет</p> : <div className="feedback-inbox-list">
        {page.map(item => <article key={item.id} className={"feedback-inbox-card admin-feedback-item" + (selected.includes(item.id) ? " is-selected" : "")}>
          <label className="admin-item-select"><input type="checkbox" aria-label={`Выбрать обращение #${item.id}`} disabled={busy} checked={selected.includes(item.id)} onChange={() => toggleSelection(item.id)} /></label>
          <details><summary>
            <div className="feedback-inbox-top"><div className="feedback-inbox-tags"><span className="admin-item-number">#{item.id}</span><span className="admin-item-category">{item.category}</span><span className="feedback-inbox-tag feedback-inbox-tag--soft">{item.type}</span>
              <span className={`feedback-inbox-tag feedback-inbox-tag--${item.status === "resolved" ? "resolved" : item.status === "in_progress" ? "progress" : "new"}`}>{FEEDBACK_STATUSES[item.status] || item.status}</span></div>
              <time className="feedback-inbox-date">{formatUtcDateTime(item.created_at)}</time></div>
            <p className="admin-message-preview">{item.message}</p>
            <div className="admin-item-footer"><span className="admin-item-byline">{[item.name || "Анонимное обращение", item.contact, item.developer_reply?.trim() ? "Есть ответ" : null, item.screenshots?.length ? `Скриншоты: ${item.screenshots.length}` : null].filter(Boolean).join(" · ")}</span>
              <span className="admin-item-open"><span className="admin-item-open-closed">Открыть обращение <span aria-hidden="true">↓</span></span><span className="admin-item-open-expanded">Свернуть <span aria-hidden="true">↑</span></span></span>
            </div>
          </summary>
          <div className="feedback-inbox-message">{item.message}</div>
          {!!item.screenshots?.length && <div className="feedback-screenshots-view-grid">{item.screenshots.map((src, index) => <a key={src} href={`/uploads/${src}`} target="_blank" rel="noreferrer"><img src={`/uploads/${src}`} alt={`Скриншот ${index + 1}`} className="feedback-screenshots-view-img" loading="lazy" /></a>)}</div>}
          <div className="feedback-reply-block">
            {item.developer_reply && <div className="feedback-reply-view"><div className="feedback-reply-text">{item.developer_reply}</div><time className="feedback-reply-date">{formatUtcDateTime(item.developer_replied_at)}</time></div>}
            <label className="ui-field">Ответ пользователю<textarea rows={3} className="feedback-reply-textarea" disabled={busy} value={replyDrafts[item.id] || ""} onChange={e => setReplyDrafts(prev => ({ ...prev, [item.id]: e.target.value }))} /></label>
            <p className="ui-field-hint">Ответ появится в обращении и уведомлениях пользователя.</p>
            <button type="button" className="primary-btn" disabled={busy || !replyDrafts[item.id]?.trim() || replyDrafts[item.id]?.trim() === item.developer_reply?.trim()} onClick={() => sendReply(item)}>Отправить ответ</button>
          </div>
          <div className="feedback-inbox-actions"><span className="ui-field-hint">Статус обращения</span>{[["in_progress", "В работу"], ["resolved", "Отметить решённым"], ["new", "Вернуть в новые"]].filter(([status]) => status !== item.status).map(([status, label]) => <button type="button" key={status} className="secondary-btn" disabled={busy} onClick={() => changeStatus([item.id], status)}>{label}</button>)}</div>
          </details>
        </article>)}
      </div>}
      {!loading && shown.length > 0 && <div className="ui-pagination"><span>Показано {page.length} из {shown.length}</span>{limit < shown.length && <button type="button" className="secondary-btn" disabled={busy} onClick={() => setLimit(value => value + 20)}>Показать ещё</button>}</div>}
    </div>
  </main></div></div>;
}
