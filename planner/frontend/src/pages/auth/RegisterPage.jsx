import { useState } from "react";
import { Link } from "react-router-dom";
import { registerUser, saveToken } from "../../api/auth";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  window.location.origin.replace(":5173", ":8000");

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
  });

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!acceptTerms) {
      setError(
        "Нужно принять пользовательское соглашение и политику обработки персональных данных"
      );
      return;
    }

    setLoading(true);

    try {
      const data = await registerUser(form);
      saveToken(data.access_token);
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Регистрация</h2>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Имя пользователя
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Пароль
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </label>

          <label className="legal-checkbox">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
            />
            <span>
              Я принимаю{" "}
              <a
                href={`${window.location.origin}/legal/user-agreement.txt`}
                target="_blank"
                rel="noreferrer"
              >
                пользовательское соглашение
              </a>
            {" "}и{" "}
            <a
              href={`${window.location.origin}/legal/personal-data-policy.txt`}
              target="_blank"
              rel="noreferrer"
            >
              политикой обработки персональных данных
            </a>
            </span>
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? "Создаем..." : "Зарегистрироваться"}
          </button>
        </form>

        <div className="auth-footer">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </div>
    </div>
  );
}
