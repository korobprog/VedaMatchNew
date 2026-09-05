import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUICK_ACTIONS,
  QUICK_ACTIONS,
  moveQuickAction,
  parseQuickConfig,
  quickActionMeta,
  serializeQuickConfig,
  toggleQuickAction,
  type QuickActionId,
} from "./quick-actions";

describe("parseQuickConfig", () => {
  it("без сохранённого набора отдаёт набор по умолчанию", () => {
    expect(parseQuickConfig(null)).toEqual([...DEFAULT_QUICK_ACTIONS]);
    expect(parseQuickConfig("")).toEqual([...DEFAULT_QUICK_ACTIONS]);
  });

  it("возвращает сохранённый порядок как есть", () => {
    expect(parseQuickConfig('["donate","aphorism"]')).toEqual([
      "donate",
      "aphorism",
    ]);
  });

  it("не падает на мусоре в хранилище", () => {
    expect(parseQuickConfig("не json")).toEqual([...DEFAULT_QUICK_ACTIONS]);
    expect(parseQuickConfig('{"a":1}')).toEqual([...DEFAULT_QUICK_ACTIONS]);
  });

  it("молча выбрасывает кнопки, которых больше нет", () => {
    // В хранилище лежит набор с прошлой версии портала.
    expect(parseQuickConfig('["donate","transits","qr"]')).toEqual(["donate"]);
  });

  it("пустой набор — это выбор: панель можно опустошить", () => {
    expect(parseQuickConfig("[]")).toEqual([]);
  });

  it("убирает дубли: две одинаковые кнопки — сбой, а не выбор", () => {
    expect(parseQuickConfig('["donate","donate"]')).toEqual(["donate"]);
  });

  it("переживает круг через сохранение", () => {
    const ids: QuickActionId[] = ["info", "calculator"];
    expect(parseQuickConfig(serializeQuickConfig(ids))).toEqual(ids);
  });
});

describe("toggleQuickAction", () => {
  it("включённая кнопка встаёт в конец — туда, куда её и кладут", () => {
    expect(toggleQuickAction(["donate"], "info")).toEqual(["donate", "info"]);
  });

  it("выключает, не трогая остальные", () => {
    expect(toggleQuickAction(["donate", "info", "support"], "info")).toEqual([
      "donate",
      "support",
    ]);
  });

  it("не меняет исходный список", () => {
    const ids: QuickActionId[] = ["donate"];
    toggleQuickAction(ids, "info");
    expect(ids).toEqual(["donate"]);
  });
});

describe("moveQuickAction", () => {
  it("двигает кнопку на шаг", () => {
    expect(moveQuickAction(["a", "b", "c"] as never, "b" as never, -1)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(moveQuickAction(["a", "b", "c"] as never, "b" as never, 1)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("на краях ничего не ломает", () => {
    expect(moveQuickAction(["a", "b"] as never, "a" as never, -1)).toEqual([
      "a",
      "b",
    ]);
    expect(moveQuickAction(["a", "b"] as never, "b" as never, 1)).toEqual([
      "a",
      "b",
    ]);
  });

  it("незнакомую кнопку не двигает", () => {
    expect(moveQuickAction(["a"] as never, "b" as never, 1)).toEqual(["a"]);
  });
});

describe("каталог кнопок", () => {
  it("у каждой кнопки есть подпись и объяснение", () => {
    for (const action of QUICK_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.hint.length).toBeGreaterThan(0);
    }
  });

  it("набор по умолчанию состоит из существующих кнопок", () => {
    for (const id of DEFAULT_QUICK_ACTIONS)
      expect(() => quickActionMeta(id)).not.toThrow();
  });

  it("идентификаторы не повторяются", () => {
    expect(new Set(QUICK_ACTIONS.map((action) => action.id)).size).toBe(
      QUICK_ACTIONS.length,
    );
  });
});
