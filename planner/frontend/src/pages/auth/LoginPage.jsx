import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginUser, saveToken } from "../../api/auth";

export default function LoginPage() {
  const navigate = useNavigate();

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
      window.location.href = "/";
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
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
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
