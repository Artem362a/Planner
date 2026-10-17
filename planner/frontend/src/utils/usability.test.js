import { describe, expect, it } from "vitest";
import { parseUtcDate, formatPlanDate } from "./dates";
import { filterFeedback } from "./feedback";
import { tasksForWeekDay } from "./weekView";
import { groupAuditEntries } from "./mcpAudit";

describe("server dates", () => {
  it("treats naive server timestamps as UTC and respects both offset signs", () => {
    expect(parseUtcDate("2026-10-03T14:25:00.123456").toISOString()).toBe("2026-10-03T14:25:00.123Z");
    expect(parseUtcDate("2026-10-03T18:25:00+04:00").toISOString()).toBe("2026-10-03T14:25:00.000Z");
    expect(parseUtcDate("2026-10-03T10:25:00-04:00").toISOString()).toBe("2026-10-03T14:25:00.000Z");
    expect(parseUtcDate("broken")).toBeNull();
    expect(parseUtcDate(null)).toBeNull();
  });
  it("renders a plan date as the same calendar day", () => {
    expect(formatPlanDate("2026-10-03", {year:"numeric"})).toContain("3 окт.");
    expect(formatPlanDate("2026-10-03", {year:"numeric"})).toContain("2026");
  });
});

describe("feedback filters", () => {
  const items = [
    {id:1, category:"Входящие", type:"Баг", status:"new", message:"Пропала задача", developer_reply:""},
    {id:2, category:"Статистика", type:"Идея", status:"in_progress", message:"Сравнение", developer_reply:"Есть план"},
    {id:3, category:"Входящие", type:"Баг", status:"resolved", name:"Лиза", message:"Исправить", developer_reply:"   "},
  ];
  it("combines query, category, type, status and unanswered filters without changing the source", () => {
    expect(filterFeedback(items, {status:"active",category:"Входящие",type:"Баг",query:" ПРОПАЛА ",unanswered:true}).map(item => item.id)).toEqual([1]);
    expect(filterFeedback(items, {query:"план"}).map(item => item.id)).toEqual([2]);
    expect(filterFeedback(items, {status:"resolved",unanswered:true}).map(item => item.id)).toEqual([3]);
    expect(filterFeedback(items, {query:"лиза"}).map(item => item.id)).toEqual([3]);
    expect(items).toHaveLength(3);
  });
});

describe("week day view", () => {
  it("includes ranges and only the expected recurring days inside their date bounds", () => {
    const tasks = [
      {id:1,task_type:"normal",start_date:"2026-10-01",end_date:"2026-10-03"},
      {id:2,task_type:"recurring",start_date:"2026-09-28",end_date:"2026-10-04",repeat_days:["5"]},
      {id:3,task_type:"recurring",start_date:"2026-10-04",end_date:"2026-10-04",repeat_days:[5]},
      {id:4,task_type:"volume",start_date:"2026-09-28",end_date:"2026-10-04"},
    ];
    expect(tasksForWeekDay(tasks,"2026-10-03",5).map(t => t.id)).toEqual([1,2,4]);
    expect(tasksForWeekDay(tasks,"2026-10-04",6).map(t => t.id)).toEqual([4]);
  });
});

describe("MCP audit grouping", () => {
  it("groups nearby consecutive calls but separates errors, intervening tools and older calls", () => {
    const make = (id, tool_name, success, created_at) => ({id,tool_name,success,created_at});
    const entries = [
      make(6,"get_day_plan",true,"2026-10-03T14:25:00"),
      make(5,"get_day_plan",true,"2026-10-03T14:24:00"),
      make(4,"get_day_plan",false,"2026-10-03T14:23:30"),
      make(3,"get_day_plan",true,"2026-10-03T14:23:00"),
      make(2,"get_week_plan",true,"2026-10-03T14:22:30"),
      make(1,"get_week_plan",true,"2026-10-01T14:22:30"),
    ];
    expect(groupAuditEntries(entries).map(group => group.entries.map(entry => entry.id))).toEqual([[6,5],[4],[3],[2],[1]]);
  });
});
