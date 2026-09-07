import { describe, expect, it } from "vitest";
import { columnAt, dropIndexAt, neighboursAt } from "./board-drop";

const columns = [
  { id: "todo", left: 0, right: 100 },
  { id: "doing", left: 110, right: 210 },
  { id: "done", left: 220, right: 320 },
];

describe("columnAt", () => {
  it("палец внутри колонки", () => {
    expect(columnAt(columns, 150)).toBe("doing");
  });

  it("палец в щели между колонками — ближайшая", () => {
    expect(columnAt(columns, 105)).toBe("todo");
    expect(columnAt(columns, 107)).toBe("doing");
  });

  it("палец ушёл за край доски — крайняя, а не «никуда»", () => {
    expect(columnAt(columns, -50)).toBe("todo");
    expect(columnAt(columns, 900)).toBe("done");
  });

  it("на доске без колонок падать некуда", () => {
    expect(columnAt([], 10)).toBeNull();
  });
});

const cards = [
  { id: "a", top: 0, bottom: 40 },
  { id: "b", top: 50, bottom: 90 },
  { id: "c", top: 100, bottom: 140 },
];

describe("neighboursAt", () => {
  it("выше середины первой — в самое начало", () => {
    expect(neighboursAt(cards, 5, "x")).toEqual({
      afterTaskId: null,
      beforeTaskId: "a",
    });
  });

  it("ниже всех — в конец", () => {
    expect(neighboursAt(cards, 500, "x")).toEqual({
      afterTaskId: "c",
      beforeTaskId: null,
    });
  });

  it("между двумя — обе границы названы", () => {
    expect(neighboursAt(cards, 45, "x")).toEqual({
      afterTaskId: "a",
      beforeTaskId: "b",
    });
  });

  it("границей служит середина карточки, а не её край", () => {
    // 30 — нижняя половина первой карточки: встаём ПОСЛЕ неё.
    expect(neighboursAt(cards, 30, "x").afterTaskId).toBe("a");
    // 15 — верхняя половина: встаём ПЕРЕД ней.
    expect(neighboursAt(cards, 15, "x").beforeTaskId).toBe("a");
  });

  it("сама перетаскиваемая карточка в расчёт не идёт", () => {
    expect(neighboursAt(cards, 45, "b")).toEqual({
      afterTaskId: "a",
      beforeTaskId: "c",
    });
  });

  it("пустая колонка — обе границы пусты", () => {
    expect(neighboursAt([], 10, "x")).toEqual({
      afterTaskId: null,
      beforeTaskId: null,
    });
  });

  it("порядок карточек не зависит от порядка замеров", () => {
    const shuffled = [cards[2], cards[0], cards[1]];
    expect(neighboursAt(shuffled, 45, "x")).toEqual({
      afterTaskId: "a",
      beforeTaskId: "b",
    });
  });
});

describe("dropIndexAt", () => {
  it("считает щель, в которую встанет карточка", () => {
    expect(dropIndexAt(cards, 5, "x")).toBe(0);
    expect(dropIndexAt(cards, 45, "x")).toBe(1);
    expect(dropIndexAt(cards, 500, "x")).toBe(3);
  });

  it("перетаскиваемая карточка щелей не создаёт", () => {
    expect(dropIndexAt(cards, 500, "c")).toBe(2);
  });
});
