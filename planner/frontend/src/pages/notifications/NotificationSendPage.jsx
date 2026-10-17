import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchUsersForNotifications,
  sendNotification,
} from "../../api/notifications";

function getAudienceLabel(audienceType) {
  if (audienceType === "single") return "Одному пользователю";
  if (audienceType === "group") return "Группе пользователей";
  return "Всем пользователям";
}

export default function NotificationSendPage() {
  const [audienceType, setAudienceType] = useState("single");
  const [users, setUsers] = useState([]);
  const [userQuery, setUserQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [form, setForm] = useState({
    title: "",
    message: "",
    singleUserId: "",
    selectedUserIds: [],
  });

  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoadingUsers(true);
      const data = await fetchUsersForNotifications();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить пользователей");
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  const visibleUsers = useMemo(() => {
    return users.filter((user) => user.role !== "developer");
  }, [users]);

  const filteredUsers = visibleUsers.filter(user => `${user.username} ${user.email}`.toLocaleLowerCase("ru-RU").includes(userQuery.trim().toLocaleLowerCase("ru-RU")));
  const recipients = audienceType === "all" ? users : visibleUsers.filter(user => audienceType === "single" ? String(user.id) === form.singleUserId : form.selectedUserIds.includes(user.id));
  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleAudienceChange(nextAudienceType) {
    setAudienceType(nextAudienceType);
    setError("");
    setSuccess("");
  }

  function toggleUser(userId) {
    setForm((prev) => {
      const exists = prev.selectedUserIds.includes(userId);

      return {
        ...prev,
        selectedUserIds: exists
          ? prev.selectedUserIds.filter((id) => id !== userId)
          : [...prev.selectedUserIds, userId],
      };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const title = form.title.trim();
    const message = form.message.trim();

    if (!title) {
      setError("Укажи заголовок уведомления");
      return;
    }

    if (!message) {
      setError("Напиши текст уведомления");
      return;
    }

    let payload = {
      title,
      message,
      audience_type: audienceType,
      user_ids: [],
    };

    if (audienceType === "single") {
      if (!form.singleUserId) {
        setError("Выбери пользователя");
        return;
      }

      payload.user_ids = [Number(form.singleUserId)];
    }

    if (audienceType === "group") {
      if (form.selectedUserIds.length === 0) {
        setError("Выбери хотя бы одного пользователя");
        return;
      }

      payload.user_ids = form.selectedUserIds.map(Number);
    }

    try {
      setSending(true);
      await sendNotification(payload);

      setSuccess(
        `Уведомление отправлено: ${getAudienceLabel(audienceType).toLowerCase()}`
      );

      setForm({
        title: "",
        message: "",
        singleUserId: "",
        selectedUserIds: [],
      });
      setAudienceType("single");
    } catch (err) {
      setError(err.message || "Не удалось отправить уведомление");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app-wrapper">
      <div className="app">
        <header className="app-header">
          <div className="app-header-left">
            <Link to="/" className="back-link">
              ←
            </Link>
          </div>

          <div className="app-header-center">ОТПРАВКА УВЕДОМЛЕНИЙ</div>

          <div className="app-header-right" />
        </header>

        <main className="day-page-main">
          <div className="notification-admin-card">
            <div className="notification-admin-topline">
              <span className="feedback-badge">Developer</span>
            </div>

            <h1 className="notification-admin-title">
              Отправка уведомлений
            </h1>

            <p className="notification-admin-subtitle">
              Можно отправить уведомление одному пользователю, группе или всем
              сразу.
            </p>

            <form className="notification-admin-form" onSubmit={handleSubmit}>
              <div className="notification-admin-audience">
                <button
                  type="button"
                  className={
                    "feedback-tab-btn" +
                    (audienceType === "single"
                      ? " feedback-tab-btn--active"
                      : "")
                  }
                  onClick={() => handleAudienceChange("single")}
                >
                  Один
                </button>

                <button
                  type="button"
                  className={
                    "feedback-tab-btn" +
                    (audienceType === "group"
                      ? " feedback-tab-btn--active"
                      : "")
                  }
                  onClick={() => handleAudienceChange("group")}
                >
                  Группа
                </button>

                <button
                  type="button"
                  className={
                    "feedback-tab-btn" +
                    (audienceType === "all"
                      ? " feedback-tab-btn--active"
                      : "")
                  }
                  onClick={() => handleAudienceChange("all")}
                >
                  Всем
                </button>
              </div>

              <label>
                Заголовок
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="Например, Важное обновление"
                />
              </label>

              <label>
                Сообщение
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Текст уведомления"
                  rows={7}
                  className="notification-admin-textarea"
                />
              </label>

              {audienceType !== "all" && <div className="notification-users-block">
                <label>Поиск получателей<input type="search" value={userQuery} onChange={e => setUserQuery(e.target.value)} placeholder="Имя или email" /></label>
                {loadingUsers ? <p>Загрузка пользователей…</p> : !filteredUsers.length ? <p>Пользователи не найдены</p> : <div className="notification-users-list">
                  {filteredUsers.map(user => {
                    const checked = audienceType === "single" ? form.singleUserId === String(user.id) : form.selectedUserIds.includes(user.id);
                    return <label key={user.id} className={"notification-user-item" + (checked ? " notification-user-item--selected" : "")}>
                      <input type={audienceType === "single" ? "radio" : "checkbox"} name={audienceType === "single" ? "recipient" : undefined} checked={checked}
                        onChange={() => audienceType === "single" ? setForm(prev => ({...prev, singleUserId: String(user.id)})) : toggleUser(user.id)} />
                      <div className="notification-user-content"><div className="notification-user-name">{user.username}</div><div className="notification-user-email">{user.email}</div></div>
                    </label>;
                  })}
                </div>}
              </div>}

              {audienceType === "all" && (
                <div className="notification-all-note">
                  Уведомление будет отправлено всем пользователям приложения.
                </div>
              )}

              <section className="notification-preview" aria-label="Предпросмотр уведомления">
                <div className="ui-modal-heading"><h2>Предпросмотр</h2><span>Получателей: {recipients.length}</span></div>
                <div className="notification-preview-message"><strong>{form.title.trim() || "Заголовок уведомления"}</strong><p>{form.message.trim() || "Здесь будет текст сообщения"}</p></div>
                {audienceType !== "all" && recipients.length > 0 && <p className="ui-field-hint">{recipients.map(user => user.username).join(", ")}</p>}
              </section>
              {error && <div className="auth-error">{error}</div>}
              {success && <div className="feedback-success">{success}</div>}

              <div className="notification-admin-actions">
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={sending || loadingUsers || !recipients.length || !form.title.trim() || !form.message.trim()}
                >
                  {sending ? "Отправка..." : "Отправить уведомление"}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
