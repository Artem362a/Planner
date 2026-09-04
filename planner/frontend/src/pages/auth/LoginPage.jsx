import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { loginUser, saveToken } from "../../api/auth";
import PasswordField from "../../components/forms/PasswordField";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await loginUser(form);
      saveToken(data.access_token);
      const requestedReturn = searchParams.get("return_to") || "/";
      const safeReturn = requestedReturn.startsWith("/") && !requestedReturn.startsWith("//")
        ? requestedReturn
        : "/";
      window.location.href = safeReturn;
    } catch (err) {
      setError(err.message || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Вход</h2>

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
            Пароль
            <PasswordField
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>

        <div className="auth-footer">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </div>
      </div>
    </div>
  );
}
