import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { submitFeedback, fetchMyFeedbackList } from "../../api/feedback";

const FEEDBACK_CATEGORIES = [
  "План на день",
  "План на неделю",
  "Календарь",
  "Цели",
  "Шаблоны",
  "Категории",
  "Авторизация",
  "Интерфейс",
  "Другое",
];

const FEEDBACK_TYPES = ["Баг", "Идея", "Вопрос", "Другое"];

const MAX_SCREENSHOTS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status) {
  if (status === "resolved") return "Решено";
  if (status === "in_progress") return "В работе";
  return "Новое";
}

export default function FeedbackPage() {
  const [activeTab, setActiveTab] = useState("new");

  const [form, setForm] = useState({
    category: "План на день",
    type: "Идея",
    name: "",
    contact: "",
    message: "",
  });

  const [screenshots, setScreenshots] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const fileInputRef = useRef(null);

  const [feedbackConsent, setFeedbackConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [myItems, setMyItems] = useState([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    setSuccess("");
    setError("");
  }

  function handleScreenshotAdd(e) {
    const newFiles = Array.from(e.target.files);
    e.target.value = "";
    if (!newFiles.length) return;

    const remaining = MAX_SCREENSHOTS - screenshots.length;
    const toAdd = newFiles.slice(0, remaining);

    const oversized = toAdd.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      setError(`Файл «${oversized.name}» превышает 5 МБ`);
      return;
    }

    const newUrls = toAdd.map((f) => URL.createObjectURL(f));
    setScreenshots((prev) => [...prev, ...toAdd]);
    setPreviewUrls((prev) => [...prev, ...newUrls]);
    setError("");
  }

  function removeScreenshot(idx) {
    URL.revokeObjectURL(previewUrls[idx]);
    setScreenshots((prev) => prev.filter((_, i) => i !== idx));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  async function loadMyFeedback() {
    try {
      setMyLoading(true);
      setMyError("");
      const data = await fetchMyFeedbackList();
      setMyItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setMyError(err.message || "Не удалось загрузить обращения");
    } finally {
      setMyLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "mine") {
      loadMyFeedback();
    }
  }, [activeTab]);

  const groupedStats = useMemo(() => ({
    total: myItems.length,
    newCount: myItems.filter((item) => item.status === "new").length,
    inProgressCount: myItems.filter((item) => item.status === "in_progress").length,
    resolvedCount: myItems.filter((item) => item.status === "resolved").length,
  }), [myItems]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSuccess("");
    setError("");

    if (!form.message.trim()) {
      setError("Напиши сообщение");
      return;
    }

    if (!feedbackConsent) {
      setError("Нужно дать согласие на обработку данных для обращения");
      return;
    }

    try {
      setLoading(true);

      await submitFeedback({
        category: form.category,
        type: form.type,
        name: form.name,
        contact: form.contact,
        message: form.message,
        screenshots,
      });

      setSuccess("Обращение отправлено");
      setForm({ category: "План на день", type: "Идея", name: "", contact: "", message: "" });
      setFeedbackConsent(false);
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      setScreenshots([]);
      setPreviewUrls([]);

      await loadMyFeedback();
      setActiveTab("mine");
    } catch (err) {
      setError(err.message || "Не удалось отправить сообщение");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-wrapper">
      <div className="app">
        <main className="day-page-main">
          <div className="feedback-page-card">
            <div className="feedback-page-header">
              <div className="feedback-page-topline">
                <Link to="/" className="feedback-back-link">← Назад</Link>
                <span className="feedback-badge">Обратная связь</span>
              </div>

              <h1 className="feedback-page-title">Напиши разработчику</h1>

              <p className="feedback-page-subtitle">
                Здесь можно отправить сообщение разработчику и посмотреть статус своих обращений.
              </p>
            </div>

            <div className="feedback-tabs">
              <button
                type="button"
                className={"feedback-tab-btn" + (activeTab === "new" ? " feedback-tab-btn--active" : "")}
                onClick={() => handleTabChange("new")}
              >
                Новое обращение
              </button>

              <button
                type="button"
                className={"feedback-tab-btn" + (activeTab === "mine" ? " feedback-tab-btn--active" : "")}
                onClick={() => handleTabChange("mine")}
              >
                Мои обращения
              </button>
            </div>

            {activeTab === "new" && (
              <form className="feedback-form" onSubmit={handleSubmit}>
                <div className="feedback-grid">
                  <label>
                    Категория
                    <select name="category" value={form.category} onChange={handleChange}>
                      {FEEDBACK_CATEGORIES.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Тип
                    <select name="type" value={form.type} onChange={handleChange}>
                      {FEEDBACK_TYPES.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="feedback-grid">
                  <label>
                    Имя
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Как к тебе обращаться"
                    />
                  </label>

                  <label>
                    Контакт для ответа
                    <input
                      type="text"
                      name="contact"
                      value={form.contact}
                      onChange={handleChange}
                      placeholder="Email / Telegram / что угодно"
                    />
                  </label>
                </div>

                <label>
                  Сообщение
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Опиши проблему, идею или пожелание"
                    rows={10}
                    className="feedback-textarea"
                  />
                </label>

                <div className="feedback-screenshots-section">
                  <div className="feedback-screenshots-header">
                    <span className="feedback-screenshots-title">Скриншоты</span>
                    <span className="feedback-screenshots-count">{screenshots.length}/{MAX_SCREENSHOTS}</span>
                  </div>

                  {previewUrls.length > 0 && (
                    <div className="feedback-screenshots-grid">
                      {previewUrls.map((url, i) => (
                        <div key={i} className="feedback-screenshot-thumb">
                          <img src={url} alt={`Скриншот ${i + 1}`} className="feedback-screenshot-img" />
                          <button
                            type="button"
                            className="feedback-screenshot-remove"
                            onClick={() => removeScreenshot(i)}
                            aria-label="Удалить скриншот"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {screenshots.length < MAX_SCREENSHOTS && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="feedback-upload-input-hidden"
                        onChange={handleScreenshotAdd}
                      />
                      <button
                        type="button"
                        className="feedback-upload-btn"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        + Прикрепить скриншот
                      </button>
                    </>
                  )}

                  <p className="feedback-screenshots-hint">
                    До {MAX_SCREENSHOTS} изображений, не более 5 МБ каждое (JPEG, PNG, WebP, GIF)
                  </p>
                </div>

                <label className="legal-checkbox">
                  <input
                    type="checkbox"
                    checked={feedbackConsent}
                    onChange={(e) => setFeedbackConsent(e.target.checked)}
                  />
                  <span>
                    Я даю согласие на обработку персональных данных, указанных в обращении, в целях
                    рассмотрения обращения и направления ответа.{" "}
                    <a
                      href={`${window.location.origin}/legal/feedback-consent.txt`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Текст согласия
                    </a>
                  </span>
                </label>

                {error && <div className="auth-error">{error}</div>}
                {success && <div className="feedback-success">{success}</div>}

                <div className="feedback-actions">
                  <button type="submit" className="primary-btn" disabled={loading}>
                    {loading ? "Отправка..." : "Отправить"}
                  </button>
                </div>
              </form>
            )}

            {activeTab === "mine" && (
              <div className="feedback-my-section">
                <div className="feedback-dashboard">
                  <div className="feedback-stat-card">
                    <div className="feedback-stat-value">{groupedStats.total}</div>
                    <div className="feedback-stat-label">Всего</div>
                  </div>
                  <div className="feedback-stat-card">
                    <div className="feedback-stat-value">{groupedStats.newCount}</div>
                    <div className="feedback-stat-label">Новые</div>
                  </div>
                  <div className="feedback-stat-card">
                    <div className="feedback-stat-value">{groupedStats.inProgressCount}</div>
                    <div className="feedback-stat-label">В работе</div>
                  </div>
                  <div className="feedback-stat-card">
                    <div className="feedback-stat-value">{groupedStats.resolvedCount}</div>
                    <div className="feedback-stat-label">Решённые</div>
                  </div>
                </div>

                {myLoading && <div className="day-task-empty">Загрузка...</div>}

                {!myLoading && myError && <div className="auth-error">{myError}</div>}

                {!myLoading && !myError && myItems.length === 0 && (
                  <div className="day-task-empty">У тебя пока нет обращений</div>
                )}

                {!myLoading && !myError && myItems.length > 0 && (
                  <div className="feedback-inbox-list">
                    {myItems.map((item) => (
                      <article key={item.id} className="feedback-inbox-card">
                        <div className="feedback-inbox-top">
                          <div className="feedback-inbox-tags">
                            <span className="feedback-inbox-tag">{item.category}</span>
                            <span className="feedback-inbox-tag feedback-inbox-tag--soft">{item.type}</span>
                            <span className={
                              "feedback-inbox-tag " +
                              (item.status === "resolved"
                                ? "feedback-inbox-tag--resolved"
                                : item.status === "in_progress"
                                ? "feedback-inbox-tag--progress"
                                : "feedback-inbox-tag--new")
                            }>
                              {getStatusLabel(item.status)}
                            </span>
                          </div>
                          <div className="feedback-inbox-date">{formatDateTime(item.created_at)}</div>
                        </div>

                        <div className="feedback-inbox-message">{item.message}</div>

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

                        {item.developer_reply && (
                          <div className="feedback-user-reply">
                            <div className="feedback-user-reply-title">Ответ разработчика</div>
                            <div className="feedback-user-reply-text">{item.developer_reply}</div>
                            {item.developer_replied_at && (
                              <div className="feedback-user-reply-date">
                                {formatDateTime(item.developer_replied_at)}
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
