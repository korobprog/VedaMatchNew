import { describe, expect, it } from "vitest";
import {
  DISMISS_DAYS,
  nextDismissals,
  parseDismissals,
  visibleCards,
} from "./advisor-dismissals";

const NOW = new Date("2026-08-17T12:00:00.000Z");
const days = (n: number) =>
  new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

describe("parseDismissals", () => {
  it("читает сохранённое", () => {
    expect(parseDismissals(JSON.stringify({ "union-profile": days(3) }))).toEqual(
      { "union-profile": days(3) },
    );
  });

  it("любой мусор трактует как «ничего не скрыто»", () => {
    // Уронить главную из-за испорченной строки в localStorage нельзя.
    for (const raw of [null, "", "не json", "[]", "42", '{"a":1}', '{"a":"вчера"}']) {
      expect(parseDismissals(raw)).toEqual({});
    }
  });

  it("отбрасывает только негодные записи, годные оставляет", () => {
    const raw = JSON.stringify({ good: days(2), bad: 5, alsoBad: "никогда" });
    expect(parseDismissals(raw)).toEqual({ good: days(2) });
  });
});

describe("nextDismissals", () => {
  it("скрывает на неделю", () => {
    const next = nextDismissals({}, "union-profile", NOW);
    expect(next["union-profile"]).toBe(days(DISMISS_DAYS));
  });

  it("выбрасывает просроченное, чтобы ключ не рос вечно", () => {
    const next = nextDismissals(
      { старое: days(-1), живое: days(2) },
      "новое",
      NOW,
    );
    expect(Object.keys(next).sort()).toEqual(["живое", "новое"]);
  });
});

describe("visibleCards", () => {
  const cards = [{ id: "a" }, { id: "b" }];

  it("прячет только то, у чего срок ещё не вышел", () => {
    expect(visibleCards(cards, { a: days(3) }, NOW)).toEqual([{ id: "b" }]);
  });

  it("возвращает карточку, когда неделя прошла", () => {
    expect(visibleCards(cards, { a: days(-1) }, NOW)).toEqual(cards);
  });

  it("без скрытий отдаёт всё", () => {
    expect(visibleCards(cards, {}, NOW)).toEqual(cards);
  });
});
