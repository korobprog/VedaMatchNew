import { describe, expect, it } from "vitest";
import {
  addDays,
  busyNights,
  conflicts,
  dayTitle,
  monthDays,
  monthStart,
  mondayOffset,
  monthTitle,
  nightsOf,
  shiftMonth,
} from "./occupancy";

describe("addDays", () => {
  it("переходит через месяц и год", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("месяцы", () => {
  it("monthStart — первое число", () => {
    expect(monthStart("2026-09-15")).toBe("2026-09-01");
  });

  it("shiftMonth переносит год в обе стороны", () => {
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("monthDays знает длину месяца и високосный февраль", () => {
    expect(monthDays("2026-09-01")).toHaveLength(30);
    expect(monthDays("2026-02-10")).toHaveLength(28);
    expect(monthDays("2028-02-01")).toHaveLength(29);
    expect(monthDays("2026-09-01")[29]).toBe("2026-09-30");
  });

  it("подписи месяца и дня — по-русски, без «г.»", () => {
    expect(monthTitle("2026-09-01")).toBe("сентябрь 2026");
    expect(dayTitle("2026-09-15")).toBe("15 сентября");
  });

  it("mondayOffset считает неделю с понедельника", () => {
    // 1 сентября 2026 — вторник, 6-е — воскресенье.
    expect(mondayOffset("2026-09-01")).toBe(1);
    expect(mondayOffset("2026-09-06")).toBe(6);
    expect(mondayOffset("2026-09-07")).toBe(0);
  });
});

describe("nightsOf и busyNights", () => {
  it("ночи — с заезда включительно по выезд исключительно", () => {
    expect(nightsOf({ checkIn: "2026-09-29", checkOut: "2026-10-02" })).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
  });

  it("кривой промежуток ночей не даёт", () => {
    expect(nightsOf({ checkIn: "2026-09-05", checkOut: "2026-09-05" })).toEqual(
      [],
    );
    expect(nightsOf({ checkIn: "мусор", checkOut: "2026-09-05" })).toEqual([]);
  });

  it("busyNights объединяет промежутки", () => {
    const set = busyNights([
      { checkIn: "2026-09-01", checkOut: "2026-09-03" },
      { checkIn: "2026-09-02", checkOut: "2026-09-04" },
    ]);
    expect([...set].sort()).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
});

describe("conflicts", () => {
  const busy = [{ checkIn: "2026-09-10", checkOut: "2026-09-15" }];

  it("пересечение — конфликт", () => {
    expect(conflicts(busy, "2026-09-12", "2026-09-20")).toBe(true);
    expect(conflicts(busy, "2026-09-05", "2026-09-11")).toBe(true);
    expect(conflicts(busy, "2026-09-11", "2026-09-12")).toBe(true);
  });

  it("выезд в день чужого заезда и заезд в день чужого выезда — не конфликт", () => {
    expect(conflicts(busy, "2026-09-05", "2026-09-10")).toBe(false);
    expect(conflicts(busy, "2026-09-15", "2026-09-18")).toBe(false);
  });

  it("незаполненные, кривые и перевёрнутые даты — не конфликт", () => {
    expect(conflicts(busy, "2026-09-12", "")).toBe(false);
    expect(conflicts(busy, "", "2026-09-12")).toBe(false);
    expect(conflicts(busy, "2026-02-30", "2026-09-12")).toBe(false);
    expect(conflicts(busy, "2026-09-14", "2026-09-11")).toBe(false);
    expect(conflicts(busy, "2026-09-12", "2026-09-12")).toBe(false);
  });

  it("без занятых промежутков конфликта нет", () => {
    expect(conflicts([], "2026-09-12", "2026-09-14")).toBe(false);
  });
});
