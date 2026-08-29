import { describe, expect, it } from "vitest";
import { formatListenedAt } from "./music-listened-at";

/** Локальное время — тесты считают в нём же, поэтому строим дату по частям. */
const at = (
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
) => new Date(year, month - 1, day, hours, minutes);

const iso = (date: Date) => date.toISOString();

describe("formatListenedAt", () => {
  const now = at(2026, 8, 29, 12, 0);

  it("сегодняшнее показывает временем", () => {
    expect(formatListenedAt(iso(at(2026, 8, 29, 9, 5)), now)).toBe("9:05");
  });

  it("вчерашнее подписывает словом", () => {
    expect(formatListenedAt(iso(at(2026, 8, 28, 21, 30)), now)).toBe(
      "вчера, 21:30",
    );
  });

  it("давнее показывает датой — «14:20» без неё бесполезно", () => {
    expect(formatListenedAt(iso(at(2026, 8, 12, 7, 0)), now)).toBe(
      "12 августа, 7:00",
    );
  });

  /**
   * Классическое место ошибки: между 23:50 и 00:10 двадцать минут, но это
   * разные сутки. Счёт по разнице в часах показал бы «сегодня».
   */
  it("через полночь считает сутками, а не часами", () => {
    const justAfterMidnight = at(2026, 8, 29, 0, 10);
    expect(formatListenedAt(iso(at(2026, 8, 28, 23, 50)), justAfterMidnight)).toBe(
      "вчера, 23:50",
    );
  });

  it("минуты дополняет нулём, часы — нет", () => {
    expect(formatListenedAt(iso(at(2026, 8, 29, 8, 7)), now)).toBe("8:07");
  });

  // Дата приходит с сервера строкой: испорченная не должна ронять страницу.
  it("на мусоре молчит, а не падает", () => {
    expect(formatListenedAt("не дата", now)).toBe("");
  });
});
