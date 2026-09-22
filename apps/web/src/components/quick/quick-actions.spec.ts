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
    expect(
      parseQuickConfig(
        '{"v":2,"ids":["donate","aphorism"]}',
      ),
    ).toEqual(["donate", "aphorism"]);
  });

  it("не падает на мусоре в хранилище", () => {
    expect(parseQuickConfig("не json")).toEqual([...DEFAULT_QUICK_ACTIONS]);
    expect(parseQuickConfig('{"a":1}')).toEqual([...DEFAULT_QUICK_ACTIONS]);
    expect(parseQuickConfig('{"v":99,"ids":["donate"]}')).toEqual([
      ...DEFAULT_QUICK_ACTIONS,
    ]);
  });

  it("молча выбрасывает кнопки, которых больше нет", () => {
    // В хранилище лежит набор с прошлой версии портала.
    expect(parseQuickConfig('{"v":2,"ids":["donate","transits","qr"]}')).toEqual(
      ["donate"],
    );
  });

  it("пустой набор — это выбор: панель можно опустошить", () => {
    expect(parseQuickConfig('{"v":2,"ids":[]}')).toEqual([]);
  });

  it("убирает дубли: две одинаковые кнопки — сбой, а не выбор", () => {
    expect(parseQuickConfig('{"v":2,"ids":["donate","donate"]}')).toEqual([
      "donate",
    ]);
  });

  // VED-163: три кнопки приехали позже панели.
  it("старую запись дополняет новыми кнопками, ставя их первыми", () => {
    expect(parseQuickConfig('["donate","aphorism"]')).toEqual([
      "window",
      "bookmarks",
      "search",
      "donate",
      "aphorism",
    ]);
  });

  it("новую запись не дополняет: выключенная кнопка остаётся выключенной", () => {
    expect(parseQuickConfig('{"v":2,"ids":["donate"]}')).toEqual(["donate"]);
  });

  it("порядок новых кнопок в старой записи не сбивается, если они там уже есть", () => {
    expect(parseQuickConfig('["donate","search"]')).toEqual([
      "window",
      "bookmarks",
      "donate",
      "search",
    ]);
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

  it("три кнопки перемещения по порталу стоят в панели по умолчанию", () => {
    // VED-163: окно, закладки и поиск — не «что держать под рукой».
    expect(DEFAULT_QUICK_ACTIONS.slice(0, 3)).toEqual([
      "window",
      "bookmarks",
      "search",
    ]);
  });

  it("идентификаторы не повторяются", () => {
    expect(new Set(QUICK_ACTIONS.map((action) => action.id)).size).toBe(
      QUICK_ACTIONS.length,
    );
  });
});
