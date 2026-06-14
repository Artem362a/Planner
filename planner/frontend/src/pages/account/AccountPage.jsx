import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  deleteAccount,
  exportAccountData,
  fetchSessions,
  importSchedule,
  removeToken,
  revokeOtherSessions,
  revokeSession,
  updateDayStart,
  updatePassword,
  updateProfile,
  updateTheme,
  uploadAvatar,
  fetchTelegramStatus,
  requestTelegramLinkCode,
  unlinkTelegram,
} from "../../api/auth";
import { fetchCategories } from "../../api/tasks";
import CategoryManagerModal from "../../components/categories/CategoryManagerModal";

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

const PRESET_AVATARS = [
  { id: "sunrise", label: "Рассвет", value: "preset:sunrise:#ff8a65:#ffd166" },
  { id: "mint", label: "Мята", value: "preset:mint:#2dd4bf:#b8f7d4" },
  { id: "violet", label: "Фиолетовый", value: "preset:violet:#7c3aed:#c4b5fd" },
  { id: "sky", label: "Небо", value: "preset:sky:#38bdf8:#dbeafe" },
  { id: "berry", label: "Ягода", value: "preset:berry:#db2777:#fecdd3" },
  { id: "forest", label: "Лес", value: "preset:forest:#16a34a:#bbf7d0" },
];

const THEME_OPTIONS = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная (в разработке)" },
];

function avatarStyle(avatar) {
  if (!avatar?.startsWith("preset:")) return {};

  const [, , colorA, colorB] = avatar.split(":");
  return {
    background: `linear-gradient(135deg, ${colorA}, ${colorB})`,
  };
}

function AvatarPreview({ avatar, username, size = "large" }) {
  const initial = (username || "U").slice(0, 1).toUpperCase();

  if (avatar && !avatar.startsWith("preset:")) {
    return (
      <div className={`account-avatar-preview account-avatar-preview--${size}`}>
        <img src={avatar} alt="" />
      </div>
    );
  }

  return (
    <div
      className={`account-avatar-preview account-avatar-preview--${size}`}
      style={avatarStyle(avatar)}
    >
      <span>{initial}</span>
    </div>
  );
}

function formatSessionDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortenUserAgent(ua) {
  if (!ua) return "Неизвестное устройство";
  // Pick a coarse browser + OS label out of the User-Agent string.
  const browser =
    /Edg\/[\d.]+/.test(ua)
      ? "Edge"
      : /Chrome\/[\d.]+/.test(ua)
      ? "Chrome"
      : /Firefox\/[\d.]+/.test(ua)
      ? "Firefox"
      : /Safari\/[\d.]+/.test(ua)
      ? "Safari"
      : "Браузер";
  const os = /Windows NT/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
    ? "macOS"
    : /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Linux/.test(ua)
    ? "Linux"
    : "ОС";
  return `${browser} · ${os}`;
}

function AccountPage({ user, onUserUpdate }) {
  const navigate = useNavigate();

  const [username, setUsername] = useState(user?.username || "");
  const [avatar, setAvatar] = useState(user?.avatar || PRESET_AVATARS[0].value);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [theme, setTheme] = useState(user?.theme || "light");
  const [themeStatus, setThemeStatus] = useState("");

  const [dayStart, setDayStart] = useState(user?.default_day_start_time || "06:00");
  const [dayStartSaving, setDayStartSaving] = useState(false);
  const [dayStartStatus, setDayStartStatus] = useState("");

  const [categoriesMap, setCategoriesMap] = useState({});
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const [exportStatus, setExportStatus] = useState("");
  const [importStatus, setImportStatus] = useState("");

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsStatus, setSessionsStatus] = useState("");

  const [tgLinked, setTgLinked] = useState(false);
  const [tgBotUsername, setTgBotUsername] = useState("");
  const [tgCode, setTgCode] = useState("");
  const [tgDeepLink, setTgDeepLink] = useState("");
  const [tgStatus, setTgStatus] = useState("");
  const [tgLoading, setTgLoading] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("");
  const [deleting, setDeleting] = useState(false);

  const selectedPreset = useMemo(
    () => PRESET_AVATARS.find((item) => item.value === avatar),
    [avatar]
  );

  const isSamaraStudent = useMemo(() => {
    const email = (user?.email || "").toLowerCase();
    // Самарский университет им. Королёва — почта на @ssau.ru.
    return email.endsWith("@ssau.ru");
  }, [user?.email]);

  useEffect(() => {
    setUsername(user?.username || "");
    setAvatar(user?.avatar || PRESET_AVATARS[0].value);
    setTheme(user?.theme || "light");
    setDayStart(user?.default_day_start_time || "06:00");
  }, [user]);

  useEffect(() => {
    fetchCategories()
      .then((rows) => {
        const map = {};
        for (const row of rows || []) {
          map[row.key] = row;
        }
        setCategoriesMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    loadTelegramStatus();
  }, []);

  function loadTelegramStatus() {
    fetchTelegramStatus()
      .then((data) => {
        setTgLinked(!!data?.linked);
        setTgBotUsername(data?.bot_username || "");
      })
      .catch(() => {});
  }

  async function handleTelegramConnect() {
    setTgLoading(true);
    setTgStatus("");
    try {
      const data = await requestTelegramLinkCode();
      setTgCode(data?.code || "");
      setTgDeepLink(data?.deep_link || "");
      setTgBotUsername(data?.bot_username || tgBotUsername);
    } catch (err) {
      setTgStatus(err.message || "Не удалось получить код");
    } finally {
      setTgLoading(false);
    }
  }

  async function handleTelegramUnlink() {
    setTgLoading(true);
    setTgStatus("");
    try {
      await unlinkTelegram();
      setTgLinked(false);
      setTgCode("");
      setTgDeepLink("");
      setTgStatus("Telegram отвязан");
    } catch (err) {
      setTgStatus(err.message || "Не удалось отвязать");
    } finally {
      setTgLoading(false);
    }
  }

  function loadSessions() {
    setSessionsLoading(true);
    fetchSessions()
      .then((rows) => setSessions(Array.isArray(rows) ? rows : []))
      .catch((err) => setSessionsStatus(err.message || "Не удалось загрузить сессии"))
      .finally(() => setSessionsLoading(false));
  }

  async function reloadCategories() {
    try {
      const rows = await fetchCategories();
      const map = {};
      for (const row of rows || []) {
        map[row.key] = row;
      }
      setCategoriesMap(map);
    } catch {
      // ignore
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileStatus("");
    setProfileSaving(true);

    try {
      const updated = await updateProfile({ username, avatar });
      onUserUpdate?.(updated);
      setProfileStatus("Профиль обновлён");
    } catch (error) {
      setProfileStatus(error.message || "Не удалось обновить профиль");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordStatus("");

    if (newPassword !== repeatPassword) {
      setPasswordStatus("Новые пароли не совпадают");
      return;
    }

    setPasswordSaving(true);

    try {
      await updatePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setPasswordStatus("Пароль обновлён");
    } catch (error) {
      setPasswordStatus(error.message || "Не удалось обновить пароль");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileStatus("Выберите изображение");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setProfileStatus("Картинка слишком большая. Максимум 2 МБ");
      return;
    }

    setProfileStatus("");
    setProfileSaving(true);

    try {
      const updated = await uploadAvatar(file);
      setAvatar(updated.avatar || PRESET_AVATARS[0].value);
      onUserUpdate?.(updated);
      setProfileStatus("Аватарка загружена");
    } catch (error) {
      setProfileStatus(error.message || "Не удалось загрузить аватарку");
    } finally {
      setProfileSaving(false);
      event.target.value = "";
    }
  }

  async function handleThemeChange(nextValue) {
    setTheme(nextValue);
    setThemeStatus("");
    try {
      const updated = await updateTheme(nextValue);
      onUserUpdate?.(updated);
      setThemeStatus("Тема обновлена");
    } catch (err) {
      setThemeStatus(err.message || "Не удалось обновить тему");
      setTheme(user?.theme || "light");
    }
  }

  async function handleDayStartSubmit(event) {
    event.preventDefault();
    setDayStartStatus("");
    setDayStartSaving(true);
    try {
      const updated = await updateDayStart(dayStart);
      onUserUpdate?.(updated);
      setDayStartStatus("Время начала дня сохранено");
    } catch (err) {
      setDayStartStatus(err.message || "Не удалось сохранить");
    } finally {
      setDayStartSaving(false);
    }
  }

  async function handleExport() {
    setExportStatus("");
    try {
      const payload = await exportAccountData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `dayplan-export-${user?.username || "user"}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportStatus("Архив сохранён");
    } catch (err) {
      setExportStatus(err.message || "Не удалось экспортировать данные");
    }
  }

  async function handleImport() {
    setImportStatus("");
    try {
      await importSchedule();
      setImportStatus("Готово");
    } catch (err) {
      setImportStatus(err.message || "Не удалось импортировать");
    }
  }

  async function handleRevokeSession(sessionId) {
    try {
      await revokeSession(sessionId);
      loadSessions();
    } catch (err) {
      setSessionsStatus(err.message || "Не удалось завершить сессию");
    }
  }

  async function handleRevokeOthers() {
    if (!window.confirm("Завершить все остальные сессии?")) return;
    try {
      const res = await revokeOtherSessions();
      setSessionsStatus(res.message || "Готово");
      loadSessions();
    } catch (err) {
      setSessionsStatus(err.message || "Не удалось завершить сессии");
    }
  }

  async function handleDeleteSubmit(event) {
    event.preventDefault();
    setDeleteStatus("");
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      removeToken();
      navigate("/login", { replace: true });
      window.location.reload();
    } catch (err) {
      setDeleteStatus(err.message || "Не удалось удалить аккаунт");
    } finally {
      setDeleting(false);
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

          <div className="app-header-center">АККАУНТ</div>

          <div className="app-header-right" />
        </header>

        <main className="account-page-main">
          <section className="account-shell">
            <div className="account-profile-band">
              <AvatarPreview avatar={avatar} username={username} />

              <div className="account-profile-copy">
                <span>Профиль</span>
                <h1>{username || "Пользователь"}</h1>
                <p>{user?.email}</p>
              </div>
            </div>

            <div className="account-settings">
              <form className="account-section" onSubmit={handleProfileSubmit}>
                <div className="account-section-info">
                  <h2>Ник и аватарка</h2>
                  <p>{selectedPreset?.label || "Своё изображение"}</p>
                </div>

                <div className="account-section-controls">
                  <label className="account-field">
                    <span>Ник</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      minLength={2}
                      required
                    />
                  </label>

                  <div className="account-avatar-picker" aria-label="Выбор аватарки">
                    {PRESET_AVATARS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          "account-avatar-option" +
                          (avatar === item.value ? " account-avatar-option--active" : "")
                        }
                        onClick={() => setAvatar(item.value)}
                        title={item.label}
                      >
                        <AvatarPreview avatar={item.value} username={username} size="small" />
                      </button>
                    ))}
                  </div>

                  <label className="account-upload">
                    <input type="file" accept="image/*" onChange={handleUpload} />
                    <span>Загрузить своё изображение до 2 МБ</span>
                  </label>

                  <button type="submit" className="account-primary-btn" disabled={profileSaving}>
                    {profileSaving ? "Сохраняем..." : "Сохранить профиль"}
                  </button>

                  {profileStatus && <div className="account-status">{profileStatus}</div>}
                </div>
              </form>

              <div className="account-section">
                <div className="account-section-info">
                  <h2>Тема оформления</h2>
                  <p>Применяется ко всему интерфейсу и синхронизируется между устройствами</p>
                </div>

                <div className="account-section-controls">
                  <div className="account-theme-row">
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={
                          "account-theme-btn" +
                          (theme === opt.value ? " account-theme-btn--active" : "")
                        }
                        onClick={() => handleThemeChange(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {themeStatus && <div className="account-status">{themeStatus}</div>}
                </div>
              </div>

              <form className="account-section" onSubmit={handleDayStartSubmit}>
                <div className="account-section-info">
                  <h2>Время начала дня</h2>
                  <p>Используется по умолчанию для новых дней в плане. Каждый день можно править отдельно.</p>
                </div>

                <div className="account-section-controls">
                  <label className="account-field">
                    <span>Время</span>
                    <input
                      type="time"
                      value={dayStart}
                      onChange={(event) => setDayStart(event.target.value)}
                      required
                    />
                  </label>

                  <button type="submit" className="account-primary-btn" disabled={dayStartSaving}>
                    {dayStartSaving ? "Сохраняем..." : "Сохранить"}
                  </button>

                  {dayStartStatus && <div className="account-status">{dayStartStatus}</div>}
                </div>
              </form>

              <div className="account-section">
                <div className="account-section-info">
                  <h2>Категории задач</h2>
                  <p>
                    {Object.keys(categoriesMap).length} категорий. Управляй цветом, иконкой и
                    названием.
                  </p>
                </div>

                <div className="account-section-controls">
                  <button
                    type="button"
                    className="account-primary-btn"
                    onClick={() => setIsCategoryModalOpen(true)}
                  >
                    Открыть управление категориями
                  </button>
                </div>
              </div>

              <div className="account-section">
                <div className="account-section-info">
                  <h2>Telegram-бот</h2>
                  <p>
                    Быстрый захват во «Входящие», план на день и уведомления
                    прямо в Telegram.
                  </p>
                </div>

                <div className="account-section-controls">
                  {tgLinked ? (
                    <>
                      <div className="account-status">✅ Telegram подключён</div>
                      <button
                        type="button"
                        className="account-primary-btn account-primary-btn--secondary"
                        onClick={handleTelegramUnlink}
                        disabled={tgLoading}
                      >
                        Отвязать Telegram
                      </button>
                    </>
                  ) : tgCode ? (
                    <>
                      <p className="account-status">
                        Открой бота и привяжи аккаунт. Код действует 15 минут.
                      </p>
                      {tgDeepLink && (
                        <a
                          className="account-primary-btn"
                          href={tgDeepLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть бота и привязать
                        </a>
                      )}
                      <div className="account-status">
                        Код для команды <code>/start {tgCode}</code>:{" "}
                        <strong>{tgCode}</strong>
                      </div>
                      <button
                        type="button"
                        className="account-primary-btn account-primary-btn--secondary"
                        onClick={loadTelegramStatus}
                        disabled={tgLoading}
                      >
                        Я привязал — проверить
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="account-primary-btn"
                      onClick={handleTelegramConnect}
                      disabled={tgLoading}
                    >
                      Подключить Telegram
                    </button>
                  )}
                  {tgStatus && <div className="account-status">{tgStatus}</div>}
                </div>
              </div>

              <form className="account-section" onSubmit={handlePasswordSubmit}>
                <div className="account-section-info">
                  <h2>Смена пароля</h2>
                  <p>Новый пароль должен быть не короче 6 символов</p>
                </div>

                <div className="account-section-controls">
                  <label className="account-field">
                    <span>Текущий пароль</span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                    />
                  </label>

                  <label className="account-field">
                    <span>Новый пароль</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={6}
                      required
                    />
                  </label>

                  <label className="account-field">
                    <span>Повтор нового пароля</span>
                    <input
                      type="password"
                      value={repeatPassword}
                      onChange={(event) => setRepeatPassword(event.target.value)}
                      minLength={6}
                      required
                    />
                  </label>

                  <button type="submit" className="account-primary-btn" disabled={passwordSaving}>
                    {passwordSaving ? "Обновляем..." : "Обновить пароль"}
                  </button>

                  {passwordStatus && <div className="account-status">{passwordStatus}</div>}
                </div>
              </form>

              {isSamaraStudent && (
                <div className="account-section">
                  <div className="account-section-info">
                    <h2>Импорт расписания</h2>
                    <p>Студентам СНИУ им. Королёва — подтянуть пары из университетского расписания.</p>
                  </div>

                  <div className="account-section-controls">
                    <button
                      type="button"
                      className="account-primary-btn"
                      onClick={handleImport}
                    >
                      Импортировать расписание
                    </button>
                    {importStatus && <div className="account-status">{importStatus}</div>}
                  </div>
                </div>
              )}

              <div className="account-section">
                <div className="account-section-info">
                  <h2>Экспорт данных</h2>
                  <p>Скачать архив со всеми задачами, целями, категориями и настройками — в JSON.</p>
                </div>

                <div className="account-section-controls">
                  <button type="button" className="account-primary-btn" onClick={handleExport}>
                    Скачать архив
                  </button>
                  {exportStatus && <div className="account-status">{exportStatus}</div>}
                </div>
              </div>

              <div className="account-section">
                <div className="account-section-info">
                  <h2>Активные сессии</h2>
                  <p>Устройства и браузеры, в которых ты сейчас залогинен. Можно завершить любую сессию.</p>
                </div>

                <div className="account-section-controls">
                  {sessionsLoading && <div className="account-status">Загрузка...</div>}

                  {!sessionsLoading && sessions.length === 0 && (
                    <div className="account-status">Сессий нет</div>
                  )}

                  {!sessionsLoading && sessions.length > 0 && (
                    <ul className="account-sessions-list">
                      {sessions.map((s) => (
                        <li
                          key={s.id}
                          className={
                            "account-session" +
                            (s.is_current ? " account-session--current" : "")
                          }
                        >
                          <div className="account-session-main">
                            <div className="account-session-title">
                              {shortenUserAgent(s.user_agent)}
                              {s.is_current && (
                                <span className="account-session-badge">текущая</span>
                              )}
                            </div>
                            <div className="account-session-meta">
                              <span>IP: {s.ip_address || "—"}</span>
                              <span>Вход: {formatSessionDate(s.created_at)}</span>
                              <span>Активность: {formatSessionDate(s.last_seen_at)}</span>
                            </div>
                          </div>
                          {!s.is_current && (
                            <button
                              type="button"
                              className="account-session-revoke"
                              onClick={() => handleRevokeSession(s.id)}
                            >
                              Завершить
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {sessions.length > 1 && (
                    <button
                      type="button"
                      className="account-primary-btn account-primary-btn--secondary"
                      onClick={handleRevokeOthers}
                    >
                      Выйти со всех других устройств
                    </button>
                  )}

                  {sessionsStatus && <div className="account-status">{sessionsStatus}</div>}
                </div>
              </div>

              <div className="account-section account-section--danger">
                <div className="account-section-info">
                  <h2>Удаление аккаунта</h2>
                  <p>Аккаунт и все связанные данные удаляются безвозвратно. Перед удалением рекомендуем скачать архив.</p>
                </div>

                <div className="account-section-controls">
                  {!deleteOpen ? (
                    <button
                      type="button"
                      className="account-danger-btn"
                      onClick={() => setDeleteOpen(true)}
                    >
                      Удалить аккаунт
                    </button>
                  ) : (
                    <form onSubmit={handleDeleteSubmit}>
                      <label className="account-field">
                        <span>Подтверди паролем</span>
                        <input
                          type="password"
                          value={deletePassword}
                          onChange={(event) => setDeletePassword(event.target.value)}
                          required
                        />
                      </label>

                      <div className="account-danger-row">
                        <button
                          type="button"
                          className="account-primary-btn account-primary-btn--secondary"
                          onClick={() => {
                            setDeleteOpen(false);
                            setDeletePassword("");
                            setDeleteStatus("");
                          }}
                          disabled={deleting}
                        >
                          Отмена
                        </button>

                        <button
                          type="submit"
                          className="account-danger-btn"
                          disabled={deleting}
                        >
                          {deleting ? "Удаляем..." : "Удалить навсегда"}
                        </button>
                      </div>

                      {deleteStatus && <div className="account-status">{deleteStatus}</div>}
                    </form>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {isCategoryModalOpen && (
        <CategoryManagerModal
          categories={categoriesMap}
          onClose={() => setIsCategoryModalOpen(false)}
          onCategoriesChanged={reloadCategories}
        />
      )}
    </div>
  );
}

export default AccountPage;
