import { describe, it, expect } from "vitest";
import { addMinutesToTime, timeStringToMinutes } from "./time";

describe("timeStringToMinutes", () => {
  it("converts HH:MM to minutes from midnight", () => {
    expect(timeStringToMinutes("00:00")).toBe(0);
    expect(timeStringToMinutes("06:00")).toBe(360);
    expect(timeStringToMinutes("09:30")).toBe(570);
    expect(timeStringToMinutes("23:59")).toBe(1439);
  });

  it("returns 0 for empty/falsy input", () => {
    expect(timeStringToMinutes("")).toBe(0);
    expect(timeStringToMinutes(null)).toBe(0);
    expect(timeStringToMinutes(undefined)).toBe(0);
  });

  it("handles stretched-day values past 24h", () => {
    expect(timeStringToMinutes("25:30")).toBe(1530);
  });
});

describe("addMinutesToTime", () => {
  it("adds minutes within the same hour", () => {
    expect(addMinutesToTime("09:00", 15)).toBe("09:15");
  });

  it("rolls minutes into the next hour", () => {
    expect(addMinutesToTime("09:45", 30)).toBe("10:15");
  });

  it("pads single digits to two", () => {
    expect(addMinutesToTime("06:05", 0)).toBe("06:05");
  });

  it("treats a missing/zero delta as no-op", () => {
    expect(addMinutesToTime("12:34")).toBe("12:34");
    expect(addMinutesToTime("12:34", 0)).toBe("12:34");
  });

  it("does NOT wrap at 24h (stretched-day model)", () => {
    // Day starts at 06:00; a task ending 20h later must read 26:00, not 02:00,
    // so its minute value stays after the day start. This is the regression we
    // fixed — guard it.
    expect(addMinutesToTime("06:00", 20 * 60)).toBe("26:00");
    expect(addMinutesToTime("23:00", 180)).toBe("26:00");
  });

  it("clamps negative results to 00:00", () => {
    expect(addMinutesToTime("00:10", -30)).toBe("00:00");
  });

  it("round-trips with timeStringToMinutes for a post-midnight task", () => {
    const start = "06:00";
    const end = addMinutesToTime(start, 1200); // 20h later
    expect(timeStringToMinutes(end)).toBeGreaterThan(timeStringToMinutes(start));
  });
});
