export const FEEDBACK_CATEGORIES = [
  "План на день", "План на неделю", "Календарь", "Цели", "Входящие", "Статистика",
  "Шаблоны", "Категории", "Авторизация", "Интерфейс", "Интеграции", "Другое",
];
export const FEEDBACK_TYPES = ["Баг", "Идея", "Вопрос", "Другое"];
export const FEEDBACK_STATUSES = { new: "Новое", in_progress: "В работе", resolved: "Решено" };

export function filterFeedback(items, { status = "all", category = "Все", type = "Все", query = "", unanswered = false } = {}) {
  const search = query.trim().toLocaleLowerCase("ru-RU");
  return items.filter((item) => {
    if (status === "active" ? item.status === "resolved" : status !== "all" && item.status !== status) return false;
    if (category !== "Все" && item.category !== category) return false;
    if (type !== "Все" && item.type !== type) return false;
    if (unanswered && item.developer_reply?.trim()) return false;
    return !search || [item.id, item.name, item.contact, item.message, item.developer_reply, item.category, item.type]
      .some((value) => String(value ?? "").toLocaleLowerCase("ru-RU").includes(search));
  });
}
