import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchFeedbackList,
  updateFeedbackStatus,
  replyToFeedback,
} from "../../api/feedback";

function formatDateTime(value) {
  if (!value) return "";

  let s = value;
  if (!s.endsWith("Z") && !s.includes("+")) s += "Z";
  // Trim microseconds to milliseconds so all browsers parse correctly
  s = s.replace(/(\.\d{3})\d+/, "$1");

  const date = new Date(s);
  if (isNaN(date.getTime())) return value;

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status) {
  if (status === "resolved") return "решено";
  if (status === "in_progress") return "в работе";
  return "новое";
}

const CATEGORY_FILTERS = [
  "Все",
  "План на день",
  "План на неделю",
  "Календарь",
  "Другое",
];

export default function FeedbackInboxPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [activeCategory, setActiveCategory] = useState("Все");
  const [updatingId, setUpdatingId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});

  async function loadFeedback() {
    try {
      setLoading(true);
      setError("");

      const data = await fetchFeedbackList();
      const normalized = Array.isArray(data) ? data : [];

      setItems(normalized);

      setReplyDrafts((prev) => {
        const next = { ...prev };

        for (const item of normalized) {
          if (!(item.id in next)) {
            next[item.id] = item.developer_reply || "";
          }
        }

        return next;
      });
    } catch (err) {
      setError(err.message || "Не удалось загрузить отзывы");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeedback();
  }, []);

  const activeItems = useMemo(
    () => items.filter((item) => item.status !== "resolved"),
    [items]
  );

  const resolvedItems = useMemo(
    () => items.filter((item) => item.status === "resolved"),
    [items]
  );

  const baseItems = activeTab === "active" ? activeItems : resolvedItems;

  const shownItems = useMemo(() => {
    if (activeCategory === "Все") {
      return baseItems;
    }

    return baseItems.filter((item) => item.category === activeCategory);
  }, [baseItems, activeCategory]);

  const emptyInboxText = useMemo(() => {
    const categoryItems =
      activeCategory === "Все"
        ? items
        : items.filter((item) => item.category === activeCategory);

    if (categoryItems.length === 0) {
      return activeCategory === "Все"
        ? "Сообщений пока нет"
        : "В этой категории пока нет сообщений";
    }

    if (activeTab === "active") {
      return activeCategory === "Все"
        ? "Все обращения решены"
        : "В этой категории все обращения решены";
    }

    return activeCategory === "Все"
      ? "Решённых сообщений пока нет"
      : "В этой категории пока нет решённых сообщений";
  }, [activeCategory, activeTab, items]);

  function setReplyDraft(id, value) {
    setReplyDrafts((prev) => ({
      ...prev,
      [id]: value,
    }));
  }

  async function handleReplySave(id) {
    const reply = (replyDrafts[id] || "").trim();
    if (!reply) return;

    try {
      setUpdatingId(id);
      const updated = await replyToFeedback(id, reply);

      setItems((prev) =>
        prev.map((item) => (item.id === id ? updated : item))
      );

      setReplyDrafts((prev) => ({
        ...prev,
        [id]: updated.developer_reply || "",
      }));
    } catch (err) {
      alert(err.message || "Не удалось сохранить ответ");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleStatusChange(id, status) {
    try {
      setUpdatingId(id);
      const updated = await updateFeedbackStatus(id, status);

      setItems((prev) =>
        prev.map((item) => (item.id === id ? updated : item))
      );
    } catch (err) {
      alert(err.message || "Не удалось обновить статус");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="app-wrapper">
      <div className="app">
        <main className="day-page-main">
          <div className="feedback-page-card feedback-admin-card">
            <div className="feedback-page-header">
              <div className="feedback-page-topline">
                <Link to="/" className="feedback-back-link">
                  ← Назад
                </Link>

                <span className="feedback-badge">Developer</span>
              </div>

              <h1 className="feedback-page-title">Отзывы пользователей</h1>

              <p className="feedback-page-subtitle">
                Здесь можно смотреть сообщения пользователей и помечать
                обращения как решённые.
              </p>
            </div>

            <div className="feedback-dashboard">
              <div className="feedback-stat-card">
                <div className="feedback-stat-value">{items.length}</div>
                <div className="feedback-stat-label">Всего</div>
              </div>

              <div className="feedback-stat-card">
                <div className="feedback-stat-value">{activeItems.length}</div>
                <div className="feedback-stat-label">Активные</div>
              </div>

              <div className="feedback-stat-card">
                <div className="feedback-stat-value">{resolvedItems.length}</div>
                <div className="feedback-stat-label">Решённые</div>
              </div>
            </div>

            <div className="feedback-tabs">
              <button
                type="button"
                className={
                  "feedback-tab-btn" +
                  (activeTab === "active" ? " feedback-tab-btn--active" : "")
                }
                onClick={() => setActiveTab("active")}
              >
                Новые / в работе
              </button>

              <button
                type="button"
                className={
                  "feedback-tab-btn" +
                  (activeTab === "resolved" ? " feedback-tab-btn--active" : "")
                }
                onClick={() => setActiveTab("resolved")}
              >
                Решённые
              </button>
            </div>

            <div className="feedback-filter-row">
              {CATEGORY_FILTERS.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={
                    "feedback-filter-chip" +
                    (activeCategory === category
                      ? " feedback-filter-chip--active"
                      : "")
                  }
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            {loading && <div className="day-task-empty">Загрузка...</div>}

            {!loading && error && <div className="auth-error">{error}</div>}

            {!loading && !error && shownItems.length === 0 && (
              <div className="day-task-empty">
                {emptyInboxText}
              </div>
            )}

            {!loading && !error && shownItems.length > 0 && (
              <div className="feedback-inbox-list">
                {shownItems.map((item) => (
                  <article key={item.id} className="feedback-inbox-card">
                    <div className="feedback-inbox-top">
                      <div className="feedback-inbox-tags">
                        <span className="feedback-inbox-tag">
                          {item.category}
                        </span>

                        <span className="feedback-inbox-tag feedback-inbox-tag--soft">
                          {item.type}
                        </span>

                        <span
                          className={
                            "feedback-inbox-tag " +
                            (item.status === "resolved"
                              ? "feedback-inbox-tag--resolved"
                              : item.status === "in_progress"
                              ? "feedback-inbox-tag--progress"
                              : "feedback-inbox-tag--new")
                          }
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      </div>

                      <div className="feedback-inbox-date">
                        {formatDateTime(item.created_at)}
                      </div>
                    </div>

                    <div className="feedback-inbox-meta">
                      <div>
                        <strong>Имя:</strong> {item.name || "—"}
                      </div>

                      <div>
                        <strong>Контакт:</strong> {item.contact || "—"}
                      </div>
                    </div>

                    <div className="feedback-inbox-message">
                      {item.message}
                    </div>

                    {item.screenshots && item.screenshots.length > 0 && (
                      <div className="feedback-screenshots-view">
                        <div className="feedback-screenshots-view-label">Скриншоты:</div>
                        <div className="feedback-screenshots-view-grid">
                          {item.screenshots.map((src, i) => (
                            <a key={i} href={`/uploads/${src}`} target="_blank" rel="noreferrer">
                              <img
                                src={`/uploads/${src}`}
                                alt={`Скриншот ${i + 1}`}
                                className="feedback-screenshots-view-img"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="feedback-reply-block">
                      <div className="feedback-reply-title">
                        Ответ разработчика
                      </div>

                      {item.developer_reply && (
                        <div className="feedback-reply-view">
                          <div className="feedback-reply-text">
                            {item.developer_reply}
                          </div>

                          {item.developer_replied_at && (
                            <div className="feedback-reply-date">
                              {formatDateTime(item.developer_replied_at)}
                            </div>
                          )}
                        </div>
                      )}

                      <textarea
                        className="feedback-reply-textarea"
                        rows={4}
                        placeholder="Написать ответ пользователю"
                        value={replyDrafts[item.id] || ""}
                        onChange={(e) =>
                          setReplyDraft(item.id, e.target.value)
                        }
                      />

                      <div className="feedback-reply-actions">
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={updatingId === item.id}
                          onClick={() => handleReplySave(item.id)}
                        >
                          Сохранить ответ
                        </button>
                      </div>
                    </div>

                    <div className="feedback-inbox-actions">
                      {item.status !== "in_progress" &&
                        item.status !== "resolved" && (
                          <button
                            type="button"
                            className="secondary-btn"
                            disabled={updatingId === item.id}
                            onClick={() =>
                              handleStatusChange(item.id, "in_progress")
                            }
                          >
                            В работу
                          </button>
                        )}

                      {item.status !== "resolved" ? (
                        <button
                          type="button"
                          className="primary-btn"
                          disabled={updatingId === item.id}
                          onClick={() =>
                            handleStatusChange(item.id, "resolved")
                          }
                        >
                          {updatingId === item.id ? "Сохранение..." : "Решено"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={updatingId === item.id}
                          onClick={() => handleStatusChange(item.id, "new")}
                        >
                          Вернуть
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
