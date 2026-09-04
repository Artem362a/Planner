import { useState } from "react";

export default function PasswordField({
  name = "password",
  value,
  onChange,
  autoComplete,
  required = false,
}) {
  const [visible, setVisible] = useState(false);
  const actionLabel = visible ? "Скрыть пароль" : "Показать пароль";

  return (
    <div className="auth-password-field">
      <input
        type={visible ? "text" : "password"}
        name={name}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
      />
      <button
        type="button"
        className="auth-password-toggle"
        aria-label={actionLabel}
        aria-pressed={visible}
        title={actionLabel}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m3 3 18 18" />
            <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
            <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.4 0 9 5.5 9 5.5a15.5 15.5 0 0 1-2.1 2.7" />
            <path d="M6.2 6.2A16.5 16.5 0 0 0 3 9.5S6.6 15 12 15a10.8 10.8 0 0 0 3-.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 9.5S6.6 4 12 4s9 5.5 9 5.5S17.4 15 12 15 3 9.5 3 9.5Z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
        )}
      </button>
    </div>
  );
}
