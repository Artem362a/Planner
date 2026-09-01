import { useEffect, useState } from "react";
import {
  disconnectSchedule,
  fetchScheduleSubscription,
  saveScheduleSubscription,
  syncScheduleNow,
} from "../../api/schedule";

function formatDateTime(value) {
  if (!value) return "ещё не выполнялась";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function syncSummary(result) {
  if (result.unchanged) return "Расписание уже актуально";
  const parts = [];
  if (result.added) parts.push(`добавлено задач: ${result.added}`);
  if (result.updated) parts.push(`обновлено: ${result.updated}`);
  if (result.removed) parts.push(`удалено: ${result.removed}`);
  if (result.protected_days) {
    parts.push(`не затронуто написанных планов: ${result.protected_days}`);
  }
  return parts.length ? `Готово — ${parts.join(", ")}` : "Готово";
}

export default function ScheduleSettings() {
  const [subscription, setSubscription] = useState(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [subgroup, setSubgroup] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const value = await fetchScheduleSubscription();
      setSubscription(value);
      setSubgroup(value.subgroup || "all");
    } catch (error) {
      setStatus(error.message || "Не удалось загрузить настройки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    if (!subscription?.connected && !feedUrl.trim()) {
      setStatus("Вставьте ссылку на расписание");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const result = await saveScheduleSubscription({
        feed_url: feedUrl.trim() || null,
        subgroup,
      });
      setFeedUrl("");
      setStatus(syncSummary(result));
      await load();
    } catch (error) {
      setStatus(error.message || "Не удалось подключить расписание");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSaving(true);
    setStatus("");
    try {
      const result = await syncScheduleNow();
      setStatus(syncSummary(result));
      await load();
    } catch (error) {
      setStatus(error.message || "Не удалось обновить расписание");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect(removeFutureTasks) {
    setSaving(true);
    setStatus("");
    try {
      const value = await disconnectSchedule(removeFutureTasks);
      setSubscription(value);
      setFeedUrl("");
      setSubgroup("all");
      setDisconnectOpen(false);
      setStatus(
        removeFutureTasks
          ? "Синхронизация отключена. Будущие нетронутые пары удалены."
          : "Синхронизация отключена. Созданные задачи сохранены."
      );
    } catch (error) {
      setStatus(error.message || "Не удалось отключить расписание");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !subscription) {
    return <div className="account-status">Загружаем настройки…</div>;
  }

  const connected = Boolean(subscription?.connected);

  return (
    <form className="schedule-settings" onSubmit={handleSave}>
      <div className="schedule-note">
        <strong>Только для студентов SSAU</strong>
        <span>
          Вставь личную ссылку на ICS из сервиса расписания. Доступ открыт всем,
          проверка университетской почты не требуется.
        </span>
        <a href="https://web.telegram.org/k/#@l9_stud_bot" target="_blank" rel="noreferrer">
          Где взять ссылку →
        </a>
      </div>

      {connected && (
        <div className="schedule-connection-card">
          <div>
            <span className="schedule-connection-label">Подключено</span>
            <strong>{subscription.feed_url_masked}</strong>
          </div>
          <div>
            Последняя синхронизация: {formatDateTime(subscription.last_synced_at)}
          </div>
          <div>Автообновление: ежедневно в 08:00 и 20:00</div>
          {subscription.last_error && (
            <div className="schedule-error">Последняя ошибка: {subscription.last_error}</div>
          )}
        </div>
      )}

      <label className="account-field">
        <span>{connected ? "Новая ссылка (если нужно заменить)" : "Ссылка на расписание ICS"}</span>
        <input
          type="url"
          inputMode="url"
          value={feedUrl}
          onChange={(event) => setFeedUrl(event.target.value)}
          placeholder="https://stud.l9labs.ru/..."
          autoComplete="off"
          required={!connected}
        />
      </label>

      <fieldset className="schedule-subgroup">
        <legend>Подгруппа</legend>
        <div className="schedule-segmented">
          {[
            ["1", "Первая"],
            ["2", "Вторая"],
            ["all", "Обе"],
          ].map(([value, label]) => (
            <label key={value} className={subgroup === value ? "is-active" : ""}>
              <input
                type="radio"
                name="schedule-subgroup"
                value={value}
                checked={subgroup === value}
                onChange={() => setSubgroup(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="schedule-actions">
        <button type="submit" className="account-primary-btn" disabled={saving}>
          {saving ? "Синхронизируем…" : connected ? "Сохранить настройки" : "Подключить расписание"}
        </button>
        {connected && (
          <>
            <button
              type="button"
              className="account-primary-btn account-primary-btn--secondary"
              onClick={handleSync}
              disabled={saving}
            >
              Обновить сейчас
            </button>
            <button
              type="button"
              className="schedule-disconnect-btn"
              onClick={() => setDisconnectOpen(true)}
              disabled={saving}
            >
              Отключить
            </button>
          </>
        )}
      </div>

      <p className="schedule-protection-copy">
        Пары добавляются в будущие ненаписанные планы как обычные задачи. Дни,
        которые ты уже планировал или изменял, синхронизация не затронет.
      </p>
      {status && <div className="account-status">{status}</div>}

      {disconnectOpen && (
        <div
          className="modal-overlay schedule-disconnect-overlay"
          onClick={() => {
            if (!saving) setDisconnectOpen(false);
          }}
        >
          <section
            className="schedule-disconnect-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-disconnect-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="schedule-disconnect-title">Отключить расписание?</h3>
            <p>Выбери, что сделать с парами, которые уже попали в планы.</p>

            <div className="schedule-disconnect-choices">
              <button
                type="button"
                onClick={() => handleDisconnect(false)}
                disabled={saving}
              >
                <strong>Оставить все задачи</strong>
                <span>Пары останутся в планах как обычные задачи.</span>
              </button>

              <button
                type="button"
                className="schedule-disconnect-choice--remove"
                onClick={() => handleDisconnect(true)}
                disabled={saving}
              >
                <strong>Удалить будущие нетронутые пары</strong>
                <span>Прошлые, сегодняшние и изменённые планы сохранятся.</span>
              </button>
            </div>

            <button
              type="button"
              className="schedule-disconnect-cancel"
              onClick={() => setDisconnectOpen(false)}
              disabled={saving}
            >
              {saving ? "Отключаем…" : "Отмена"}
            </button>
          </section>
        </div>
      )}
    </form>
  );
}
