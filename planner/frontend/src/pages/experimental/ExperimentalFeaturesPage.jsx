import { useEffect, useRef, useState } from "react";
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
  const [allowlistOpen, setAllowlistOpen] = useState(false);
  const [allowlistLoading, setAllowlistLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [copied, setCopied] = useState(false);
  const allowlistRef = useRef(null);
  const allowlistInputRef = useRef(null);

  async function loadPersonalData() {
    const [statusData, connectionData, auditData] = await Promise.all([
      fetchMcpStatus(),
      fetchMcpConnections(),
      fetchMcpAudit(10),
    ]);
    setStatus(statusData);
    setConnections(Array.isArray(connectionData) ? connectionData : []);
    setAudit(Array.isArray(auditData) ? auditData : []);
  }

  async function loadAllowlist(value = query) {
    if (user?.role !== "developer") return;
    setAllowlistLoading(true);
    try {
      const data = await fetchMcpAllowlist(value);
      setAllowlist(Array.isArray(data) ? data : []);
    } finally {
      setAllowlistLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        await loadPersonalData();
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Не удалось загрузить экспериментальные функции");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user?.role !== "developer") return undefined;
    let cancelled = false;
    setAllowlistLoading(true);
    const timeout = window.setTimeout(() => {
      fetchMcpAllowlist(query)
        .then((data) => {
          if (!cancelled) setAllowlist(Array.isArray(data) ? data : []);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || "Не удалось выполнить поиск");
        })
        .finally(() => {
          if (!cancelled) setAllowlistLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, user?.role]);

  useEffect(() => {
    function closeAllowlist(event) {
      if (allowlistRef.current && !allowlistRef.current.contains(event.target)) {
        setAllowlistOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeAllowlist);
    return () => document.removeEventListener("pointerdown", closeAllowlist);
  }, []);

  async function handleToggle(item) {
    try {
      setUpdatingId(item.id);
      setError("");
      await setMcpAllowlistAccess(item.id, !item.mcp_enabled);
      await Promise.all([loadAllowlist(query), loadPersonalData()]);
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

  function toggleAllowlist() {
    setAllowlistOpen((current) => {
      if (!current) window.setTimeout(() => allowlistInputRef.current?.focus(), 0);
      return !current;
    });
  }

  return (
    <div className="app-wrapper experimental-page">
      <div className="app experimental-app">
        <header className="app-header">
          <div className="app-header-left">
            <Link to="/" className="back-link">←</Link>
          </div>
          <div className="app-header-center">ЭКСПЕРИМЕНТАЛЬНЫЕ ФУНКЦИИ</div>
          <div className="app-header-right" />
        </header>

        <main className="day-page-main experimental-main">
          <div className="experimental-shell">
            <header className="experimental-hero">
              <h1>Управление MCP</h1>
              <p>Безопасное подключение AI-клиентов к планировщику через OAuth 2.1.</p>
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
                    <h2>Allowlist пользователей</h2>
                    <p>Отключение пользователя немедленно отзывает все его MCP-токены.</p>
                  </div>
                </div>

                <div className="experimental-combobox" ref={allowlistRef}>
                  <div className={`experimental-combobox-control ${allowlistOpen ? "is-open" : ""}`}>
                    <input
                      ref={allowlistInputRef}
                      role="combobox"
                      aria-expanded={allowlistOpen}
                      aria-controls="experimental-allowlist-options"
                      aria-autocomplete="list"
                      autoComplete="off"
                      value={query}
                      onFocus={() => setAllowlistOpen(true)}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setAllowlistOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setAllowlistOpen(false);
                      }}
                      placeholder="Найти по email или имени"
                    />
                    <button
                      type="button"
                      className="experimental-combobox-toggle"
                      aria-label={allowlistOpen ? "Закрыть список" : "Открыть список"}
                      onClick={toggleAllowlist}
                    >
                      <span aria-hidden="true" />
                    </button>
                  </div>

                  {allowlistOpen && (
                    <div id="experimental-allowlist-options" className="experimental-combobox-dropdown">
                      {allowlistLoading ? (
                        <div className="experimental-combobox-message">Ищем пользователей…</div>
                      ) : allowlist.length === 0 ? (
                        <div className="experimental-combobox-message">Никого не нашли</div>
                      ) : (
                        allowlist.map((item) => (
                          <div key={item.id} className="experimental-user-row">
                            <div>
                              <strong>{item.username}</strong>
                              <div className="experimental-meta">
                                {item.email} · {item.role} · подключений: {item.active_connections}
                              </div>
                            </div>
                            <button
                              type="button"
                              className={`experimental-access-btn ${item.mcp_enabled ? "is-remove" : "is-add"}`}
                              disabled={updatingId === item.id}
                              onClick={() => handleToggle(item)}
                            >
                              {item.mcp_enabled ? "Убрать" : "Разрешить"}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {!loading && (
              <section className="experimental-card">
                <h2>Последние действия ИИ</h2>
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
                        <span>{entry.success ? "Выполнено" : "Ошибка"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
