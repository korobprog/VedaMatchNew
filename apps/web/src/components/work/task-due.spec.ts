import { describe, expect, it } from "vitest";
import { dueFromInput, dueToInput, endOfDayInput } from "./task-due";

describe("dueToInput", () => {
  it("пустой срок оставляет поле пустым", () => {
    expect(dueToInput(null)).toBe("");
  });

  it("мусор вместо даты не превращается в 1970 год", () => {
    expect(dueToInput("не дата")).toBe("");
  });

  it("возвращает местное время без зоны", () => {
    const iso = new Date(2026, 8, 7, 21, 15).toISOString();
    expect(dueToInput(iso)).toBe("2026-09-07T21:15");
  });
});

describe("dueFromInput", () => {
  it("пустое поле — это снятый срок", () => {
    expect(dueFromInput("")).toBeNull();
  });

  it("непонятная дата не уезжает на сервер", () => {
    expect(dueFromInput("завтра")).toBeUndefined();
  });

  it("полная дата едет в ISO", () => {
    expect(dueFromInput("2026-09-07T21:15")).toBe(
      new Date(2026, 8, 7, 21, 15).toISOString(),
    );
  });
});

describe("endOfDayInput", () => {
  it("тот же день, 23:59", () => {
    expect(endOfDayInput(new Date(2026, 8, 7, 3, 4))).toBe("2026-09-07T23:59");
  });

  it("вечер не перекидывает срок на завтра", () => {
    expect(endOfDayInput(new Date(2026, 8, 7, 23, 58))).toBe(
      "2026-09-07T23:59",
    );
  });
});
