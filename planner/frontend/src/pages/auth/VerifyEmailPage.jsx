import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../../api/auth";

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = React.useState("loading");
  const [message, setMessage] = React.useState("Подтверждаем email...");

  React.useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Токен подтверждения отсутствует");
      return;
    }

    verifyEmail(token)
      .then((data) => {
        setStatus("success");
        setMessage(data.message || "Email успешно подтверждён");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message || "Не удалось подтвердить email");
      });
  }, [searchParams]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>
          {status === "loading" && "Подтверждение..."}
          {status === "success" && "Email подтверждён"}
          {status === "error" && "Ошибка"}
        </h2>

        <div className="auth-footer" style={{ marginTop: 12 }}>
          {message}
        </div>

        {status !== "loading" && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <Link to="/login" className="primary-btn">
              Перейти ко входу
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default VerifyEmailPage;
