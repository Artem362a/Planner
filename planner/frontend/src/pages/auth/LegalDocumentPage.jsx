import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

const DOCUMENTS = {
  "user-agreement": "Пользовательское соглашение",
  "personal-data-policy": "Политика обработки персональных данных",
  "feedback-consent": "Согласие на обработку данных обращения",
};

export default function LegalDocumentPage() {
  const { document } = useParams();
  const title = Object.hasOwn(DOCUMENTS, document) ? DOCUMENTS[document] : null;
  const [state, setState] = useState({ document: null, text: "", error: "" });
  useEffect(() => {
    if (!title) return;
    const controller = new AbortController();
    fetch(`/legal/${document}.txt`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Документ не удалось загрузить"); return response.text(); })
      .then(text => setState({ document, text, error: "" }))
      .catch(error => { if (error.name !== "AbortError") setState({ document, text: "", error: error.message }); });
    return () => controller.abort();
  }, [document, title]);
  const loaded = state.document === document;
  return <div className="app-wrapper"><main className="legal-document">
    <div className="ui-modal-heading"><h1>{title || "Документ не найден"}</h1><Link className="secondary-btn" to={document === "feedback-consent" ? "/feedback" : "/register"}>Назад</Link></div>
    {title && (!loaded ? <p role="status">Загружаем документ…</p> : state.error ? <p role="alert">{state.error}</p> : <pre>{state.text}</pre>)}
  </main></div>;
}
