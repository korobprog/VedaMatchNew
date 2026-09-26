import { describe, expect, it } from "vitest";
import {
  dueFromInput,
  duePresetInput,
  dueToInput,
  endOfDayInput,
} from "./task-due";

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

describe("duePresetInput (VED-529)", () => {
  const now = new Date(2026, 8, 30, 10, 15); // 30 сентября, 10:15 местного

  it("«Сегодня» — конец сегодняшнего дня", () => {
    expect(duePresetInput("today", now)).toBe("2026-09-30T23:59");
  });

  it("«До завтра» — конец завтрашнего, через границу месяца", () => {
    expect(duePresetInput("tomorrow", now)).toBe("2026-10-01T23:59");
  });

  it("«Послезавтра и позже» — конец послезавтрашнего", () => {
    expect(duePresetInput("later", now)).toBe("2026-10-02T23:59");
  });
});
