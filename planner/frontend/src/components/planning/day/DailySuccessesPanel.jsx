import { useEffect, useRef, useState } from "react";
import { deleteDailySuccess, fetchDailySuccesses, saveDailySuccess } from "../../../api/dailySuccesses";
import { CategoryIcon } from "../../icons";
import SuccessCategoryPicker from "../../forms/SuccessCategoryPicker";

export default function DailySuccessesPanel({ day, categories, showTitle = true }) {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetchDailySuccesses({ startDate: day, endDate: day })
      .then(data => { if (active) { setItems(data.items); setHasMore(data.has_more); } })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [day]);

  function resetForm() {
    setText(""); setCategoryId(""); setEditingId(null);
  }

  async function submit(event) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const saved = await saveDailySuccess({ day, text: text.trim(), category_id: categoryId ? Number(categoryId) : null }, editingId);
      setItems(previous => editingId ? previous.map(item => item.id === editingId ? saved : item) : [saved, ...previous]);
      resetForm();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    if (!window.confirm("Удалить эту запись об успехе?")) return;
    setBusy(true); setError("");
    try {
      await deleteDailySuccess(item.id);
      setItems(previous => previous.filter(row => row.id !== item.id));
      if (editingId === item.id) resetForm();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function loadMore() {
    setBusy(true); setError("");
    try {
      const result = await fetchDailySuccesses({ startDate: day, endDate: day, offset: items.length });
      setItems(previous => [...previous, ...result.items]); setHasMore(result.has_more);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <section className="day-side-section daily-successes-panel">
    {showTitle && <div className="day-side-title-row"><h3>Успехи за день</h3></div>}
    <form className="success-form" onSubmit={submit}>
      <textarea ref={textRef} aria-label="Успех за день" placeholder="Что сегодня получилось?" value={text} maxLength={1500} rows={3} disabled={busy || loading} onChange={event => setText(event.target.value)} />
      <SuccessCategoryPicker label="Категория успеха" value={categoryId} categories={Object.values(categories)} disabled={busy || loading} onChange={setCategoryId} />
      <div className="success-form-actions">
        <button className="primary-btn" type="submit" disabled={busy || loading || !text.trim()}>{busy ? "Сохраняем…" : editingId ? "Сохранить" : "Записать успех"}</button>
        {editingId && <button className="secondary-btn" type="button" disabled={busy} onClick={resetForm}>Отмена</button>}
      </div>
    </form>
    {error && <p className="successes-error" role="alert">{error}</p>}
    {loading ? <p className="successes-empty" role="status">Загружаем успехи…</p> : !items.length && !error ? <p className="successes-empty">Пока нет записей за этот день.</p> : null}
    <ul className="successes-list">{items.map(item => <li key={item.id} className={`success-entry${editingId === item.id ? " success-entry--editing" : ""}`} style={{ "--success-color": item.category?.color || "var(--accent)" }}>
      <div className="success-entry-heading">
        <span className="success-category"><span className="success-category-icon"><CategoryIcon name={item.category?.icon || "tag"} /></span>{item.category?.title || "Без категории"}</span>
        <div className="success-entry-actions">
          <button type="button" disabled={busy} title="Изменить" aria-label={`Изменить успех: ${item.text}`} onClick={() => { setEditingId(item.id); setText(item.text); setCategoryId(item.category?.id ? String(item.category.id) : ""); textRef.current?.focus(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" /></svg>
          </button>
          <button type="button" className="success-delete" disabled={busy} title="Удалить" aria-label={`Удалить успех: ${item.text}`} onClick={() => remove(item)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" /></svg>
          </button>
        </div>
      </div>
      <p>{item.text}</p>
    </li>)}</ul>
    {hasMore && <button className="secondary-btn" type="button" disabled={busy} onClick={loadMore}>Показать ещё</button>}
  </section>;
}
