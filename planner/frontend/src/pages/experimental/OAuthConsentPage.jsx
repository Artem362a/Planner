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

  return (
    <div className="oauth-consent-page">
      <main className="oauth-consent-card">
        <span className="experimental-kicker">Безопасное подключение</span>
        <h1>Разрешить доступ к Day Plan?</h1>

        {loading && <p>Проверяем запрос…</p>}
        {visibleError && <div className="auth-error">{visibleError}</div>}

        {!loading && request && (
          <>
            <p className="oauth-client-name">
              Клиент <strong>{request.client_name}</strong> запрашивает доступ к вашему планировщику.
            </p>

            <div className="oauth-scope-list">
              {request.requested_scopes.map((scope) => {
                const dangerous = DANGEROUS_SCOPES.has(scope);
                return (
                  <label key={scope} className={`oauth-scope ${dangerous ? "is-dangerous" : ""}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(scope)}
                      disabled={scope === "planner:read" || submitting}
                      onChange={() => toggleScope(scope)}
                    />
                    <span>
                      <strong>{request.scope_labels[scope] || scope}</strong>
                      {dangerous && <small>Опасное действие — включите вручную</small>}
                    </span>
                  </label>
                );
              })}
            </div>

            <p className="experimental-hint">
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
      </main>
    </div>
  );
}
