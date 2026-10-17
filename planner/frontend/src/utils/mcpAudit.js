import { parseUtcDate } from "./dates";

export const MCP_TOOL_LABELS = {
  get_day_plan: "Просмотр плана дня", get_week_plan: "Просмотр плана недели",
  list_inbox: "Просмотр входящих", list_goals: "Просмотр целей", get_statistics: "Просмотр статистики",
  get_day_note: "Просмотр заметки дня", list_categories: "Просмотр категорий", list_reminders: "Просмотр напоминаний",
  get_university_schedule: "Просмотр расписания занятий", list_user_feedback: "Просмотр обращений", list_templates: "Просмотр шаблонов",
  create_day_task: "Создание задачи дня", edit_day_task: "Изменение задачи дня", complete_day_task: "Изменение выполнения задачи дня",
  reschedule_day_task: "Перенос задачи дня", delete_day_task: "Удаление задачи дня",
  create_week_task: "Создание задачи недели", edit_week_task: "Изменение задачи недели", delete_week_task: "Удаление задачи недели",
  create_inbox_item: "Добавление во входящие", edit_inbox_item: "Изменение входящей задачи", delete_inbox_item: "Удаление входящей задачи",
  schedule_inbox_item_for_day: "Перенос входящей задачи в день", schedule_inbox_item_for_week: "Перенос входящей задачи в неделю",
  create_goal: "Создание цели", edit_goal: "Изменение цели", delete_goal: "Удаление цели",
  create_goal_stage: "Создание этапа цели", edit_goal_stage: "Изменение этапа цели", delete_goal_stage: "Удаление этапа цели",
  save_day_note: "Сохранение заметки дня", set_day_start: "Изменение начала дня",
  create_reminder: "Создание напоминания", snooze_reminder: "Отложенное напоминание", delete_reminder: "Удаление напоминания",
  create_category: "Создание категории", edit_category: "Изменение категории", delete_category: "Удаление категории",
  apply_day_template: "Применение шаблона дня",
  list_daily_successes: "Просмотр успехов", get_daily_successes_summary: "Сводка успехов по категориям",
  create_daily_success: "Добавление успеха", edit_daily_success: "Изменение успеха", delete_daily_success: "Удаление успеха",
};

export function groupAuditEntries(entries) {
  const groups = [];
  for (const entry of entries) {
    const previous = groups.at(-1);
    const last = previous?.entries.at(-1);
    const time = parseUtcDate(entry.created_at)?.getTime();
    const firstTime = parseUtcDate(previous?.entries[0]?.created_at)?.getTime();
    if (last && last.tool_name === entry.tool_name && last.success === entry.success && time != null && firstTime != null && Math.abs(time - firstTime) <= 120000) {
      previous.entries.push(entry);
    } else {
      groups.push({ id: entry.id, tool_name: entry.tool_name, success: entry.success, entries: [entry] });
    }
  }
  return groups;
}
