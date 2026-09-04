import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  approveOAuthRequest,
  denyOAuthRequest,
  fetchOAuthRequest,
} from "../../api/experimental";

const DANGEROUS_SCOPES = new Set([
  "tasks:delete",
  "goals:delete",
  "organizer:delete",
]);

export default function OAuthConsentPage() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get("request") || "";
  const [request, setRequest] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(Boolean(requestId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const visibleError = error || (!requestId ? "В запросе отсутствует идентификатор подключения" : "");
  const regularScopes = request?.requested_scopes.filter((scope) => !DANGEROUS_SCOPES.has(scope)) || [];
  const dangerousScopes = request?.requested_scopes.filter((scope) => DANGEROUS_SCOPES.has(scope)) || [];

  useEffect(() => {
    if (!requestId) return;
    fetchOAuthRequest(requestId)
      .then((data) => {
        setRequest(data);
        setSelected(new Set(data.requested_scopes.filter((scope) => !DANGEROUS_SCOPES.has(scope))));
      })
      .catch((err) => setError(err.message || "Запрос подключения недействителен"))
      .finally(() => setLoading(false));
  }, [requestId]);

  function toggleScope(scope) {
    if (scope === "planner:read") return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function finish(action) {
    try {
      setSubmitting(true);
      setError("");
      const result = action === "approve"
        ? await approveOAuthRequest(requestId, Array.from(selected))
        : await denyOAuthRequest(requestId);
      window.location.assign(result.redirect_url);
    } catch (err) {
      setError(err.message || "Не удалось завершить подключение");
      setSubmitting(false);
    }
  }

  function renderScope(scope, dangerous = false) {
    return (
      <label key={scope} className={`oauth-scope ${dangerous ? "is-dangerous" : ""}`}>
        <input
          type="checkbox"
          checked={selected.has(scope)}
          disabled={scope === "planner:read" || submitting}
          onChange={() => toggleScope(scope)}
        />
        <span className="oauth-scope-copy">
          <span className="oauth-scope-label">{request.scope_labels[scope] || scope}</span>
          {dangerous && <small>Выключено по умолчанию — разрешите только при необходимости</small>}
        </span>
      </label>
    );
  }

  return (
    <div className="app-wrapper oauth-consent-page">
      <div className="app oauth-consent-app">
        <header className="app-header">
          <div className="app-header-left" />
          <div className="app-header-center">ПОДКЛЮЧЕНИЕ MCP</div>
          <div className="app-header-right" />
        </header>

        <main className="day-page-main oauth-consent-main">
          <section className="oauth-consent-card">
            <h1>Разрешить доступ к Day Plan?</h1>

            {loading && <p>Проверяем запрос…</p>}
            {visibleError && <div className="auth-error">{visibleError}</div>}

            {!loading && request && (
              <>
                <p className="oauth-client-name">
                  Клиент <span>{request.client_name}</span> запрашивает доступ к вашему планировщику.
                </p>

                <div className="oauth-scope-list">
                  {regularScopes.map((scope) => renderScope(scope))}
                </div>

                {dangerousScopes.length > 0 && (
                  <section className="oauth-danger-zone">
                    <h2>Опасные действия</h2>
                    <p>Эти разрешения могут безвозвратно удалить данные и требуют отдельного подтверждения.</p>
                    <div className="oauth-scope-list">
                      {dangerousScopes.map((scope) => renderScope(scope, true))}
                    </div>
                  </section>
                )}

                <p className="experimental-hint oauth-security-hint">
                  Клиент не получит пароль, доступ к профилю, активным сессиям или Telegram.
                  Разрешение можно отозвать в экспериментальных функциях.
                </p>

                <div className="oauth-consent-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={submitting}
                    onClick={() => finish("deny")}
                  >
                    Отменить
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={submitting || !selected.has("planner:read")}
                    onClick={() => finish("approve")}
                  >
                    {submitting ? "Подключаем…" : "Разрешить выбранное"}
                  </button>
                </div>
              </>
            )}

            {!loading && !request && (
              <Link to="/" className="feedback-back-link">Вернуться в планировщик</Link>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
