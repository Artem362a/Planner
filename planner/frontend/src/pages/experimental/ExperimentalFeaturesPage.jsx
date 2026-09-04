import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchMcpAllowlist,
  fetchMcpAudit,
  fetchMcpConnections,
  fetchMcpStatus,
  revokeMcpConnection,
  setMcpAllowlistAccess,
} from "../../api/experimental";

function formatDate(value) {
  if (!value) return "—";
  const normalized = value.endsWith("Z") || value.includes("+") ? value : `${value}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("ru-RU");
}

const SCOPE_NAMES = {
  "planner:read": "Чтение планировщика и статистики",
  "tasks:create": "Создание задач",
  "tasks:edit": "Редактирование и перенос задач",
  "tasks:delete": "Удаление задач",
  "goals:create": "Создание целей",
  "goals:edit": "Редактирование целей",
  "goals:delete": "Удаление целей",
  "organizer:edit": "Заметки, категории, шаблоны и напоминания",
  "organizer:delete": "Удаление элементов органайзера",
  "schedule:read": "Чтение расписания занятий",
  "feedback:read_all": "Чтение отзывов пользователей",
};

export default function ExperimentalFeaturesPage({ user }) {
  const [status, setStatus] = useState(null);
  const [connections, setConnections] = useState([]);
  const [audit, setAudit] = useState([]);
  const [allowlist, setAllowlist] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [copied, setCopied] = useState(false);

  async function loadPersonalData() {
    const [statusData, connectionData, auditData] = await Promise.all([
      fetchMcpStatus(),
      fetchMcpConnections(),
      fetchMcpAudit(30),
    ]);
    setStatus(statusData);
    setConnections(Array.isArray(connectionData) ? connectionData : []);
    setAudit(Array.isArray(auditData) ? auditData : []);
  }

  async function loadAllowlist(value = query) {
    if (user?.role !== "developer") return;
    const data = await fetchMcpAllowlist(value);
    setAllowlist(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        await Promise.all([loadPersonalData(), loadAllowlist("")]);
      } catch (err) {
        if (!cancelled) setError(err.message || "Не удалось загрузить экспериментальные функции");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // Initial load only; the current authenticated user does not change on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggle(item) {
    try {
      setUpdatingId(item.id);
      setError("");
      await setMcpAllowlistAccess(item.id, !item.mcp_enabled);
      await Promise.all([loadAllowlist(), loadPersonalData()]);
    } catch (err) {
      setError(err.message || "Не удалось изменить allowlist");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRevoke(connection) {
    if (!window.confirm(`Отозвать доступ у «${connection.client_name}»?`)) return;
    try {
      setUpdatingId(`connection-${connection.id}`);
      await revokeMcpConnection(connection.id);
      await loadPersonalData();
    } catch (err) {
      setError(err.message || "Не удалось отозвать подключение");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleCopy() {
    if (!status?.resource_url) return;
    await navigator.clipboard.writeText(status.resource_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function handleSearch(event) {
    event.preventDefault();
    try {
      setError("");
      await loadAllowlist(query);
    } catch (err) {
      setError(err.message || "Не удалось выполнить поиск");
    }
  }

  return (
    <div className="app-wrapper experimental-page">
      <main className="experimental-main">
        <Link to="/" className="feedback-back-link">← Назад</Link>

        <header className="experimental-hero">
          <span className="experimental-kicker">Лаборатория Day Plan</span>
          <h1>Экспериментальные функции</h1>
          <p>Безопасное подключение AI-клиентов к планировщику через MCP и OAuth 2.1.</p>
        </header>

        {loading && <div className="experimental-card">Загрузка…</div>}
        {error && <div className="auth-error experimental-error">{error}</div>}

        {!loading && status && (
          <section className="experimental-card">
            <div className="experimental-card-title-row">
              <div>
                <h2>MCP для вашего аккаунта</h2>
                <p>Access-токен действует {status.access_token_minutes} минут.</p>
              </div>
              <span className={`experimental-status ${status.enabled ? "is-on" : "is-off"}`}>
                {status.enabled ? "Доступ разрешён" : "Нет в allowlist"}
              </span>
            </div>

            <div className="experimental-url-row">
              <code>{status.resource_url}</code>
              <button type="button" className="secondary-btn" onClick={handleCopy}>
                {copied ? "Скопировано" : "Копировать"}
              </button>
            </div>
            <p className="experimental-hint">
              Добавьте этот URL в MCP-клиент. В браузере откроется вход в Day Plan и выбор прав.
            </p>
          </section>
        )}

        {!loading && (
          <section className="experimental-card">
            <h2>Подключённые AI-клиенты</h2>
            {connections.length === 0 ? (
              <p className="experimental-empty">Активных и отозванных подключений пока нет.</p>
            ) : (
              <div className="experimental-connections">
                {connections.map((connection) => (
                  <article key={connection.id} className="experimental-connection">
                    <div>
                      <strong>{connection.client_name}</strong>
                      <div className="experimental-meta">
                        Создано: {formatDate(connection.created_at)} · Последний вызов: {formatDate(connection.last_used_at)}
                      </div>
                      <div className="experimental-scope-list">
                        {connection.scopes.map((scope) => (
                          <span key={scope}>{SCOPE_NAMES[scope] || scope}</span>
                        ))}
                      </div>
                    </div>
                    {connection.revoked_at ? (
                      <span className="experimental-status is-off">Отозвано</span>
                    ) : (
                      <button
                        type="button"
                        className="danger-btn"
                        disabled={updatingId === `connection-${connection.id}`}
                        onClick={() => handleRevoke(connection)}
                      >
                        Отозвать
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {!loading && user?.role === "developer" && (
          <section className="experimental-card">
            <div className="experimental-card-title-row">
              <div>
                <span className="feedback-badge">Developer</span>
                <h2>Allowlist пользователей</h2>
                <p>Отключение пользователя немедленно отзывает все его MCP-токены.</p>
              </div>
            </div>

            <form className="experimental-search" onSubmit={handleSearch}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Email или имя пользователя"
              />
              <button type="submit" className="secondary-btn">Найти</button>
            </form>

            <div className="experimental-user-list">
              {allowlist.map((item) => (
                <div key={item.id} className="experimental-user-row">
                  <div>
                    <strong>{item.username}</strong>
                    <div className="experimental-meta">
                      {item.email} · {item.role} · подключений: {item.active_connections}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={item.mcp_enabled ? "danger-btn" : "primary-btn"}
                    disabled={updatingId === item.id}
                    onClick={() => handleToggle(item)}
                  >
                    {item.mcp_enabled ? "Убрать" : "Разрешить"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && (
          <section className="experimental-card">
            <h2>Последние действия MCP</h2>
            {audit.length === 0 ? (
              <p className="experimental-empty">ИИ ещё не вызывала инструменты планировщика.</p>
            ) : (
              <div className="experimental-audit-list">
                {audit.map((entry) => (
                  <div key={entry.id} className="experimental-audit-row">
                    <span className={`experimental-audit-dot ${entry.success ? "is-ok" : "is-error"}`} />
                    <div>
                      <strong>{entry.tool_name}</strong>
                      <div className="experimental-meta">{formatDate(entry.created_at)}</div>
                    </div>
                    <span>{entry.success ? "Выполнено" : entry.error || "Ошибка"}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
