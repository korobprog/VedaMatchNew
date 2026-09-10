import { describe, expect, it } from "vitest";
import {
  collapsedColumnsKey,
  everyColumnCollapsed,
  expandCollapsedColumn,
  parseCollapsedColumns,
  serializeCollapsedColumns,
  toggleAllColumns,
  toggleCollapsedColumn,
} from "./column-collapse";

describe("collapsedColumnsKey", () => {
  it("у каждой доски свой ключ", () => {
    expect(collapsedColumnsKey("a")).not.toBe(collapsedColumnsKey("b"));
  });
});

describe("parseCollapsedColumns", () => {
  it("пусто в хранилище — ничего не свёрнуто", () => {
    expect(parseCollapsedColumns(null)).toEqual([]);
    expect(parseCollapsedColumns("")).toEqual([]);
  });

  it("не-JSON не роняет экран", () => {
    expect(parseCollapsedColumns("{не json")).toEqual([]);
  });

  it("чужая форма данных отбрасывается целиком", () => {
    expect(parseCollapsedColumns('{"a":1}')).toEqual([]);
  });

  it("посторонние элементы выбрасываются, свои остаются", () => {
    expect(parseCollapsedColumns('["c1",7,"",null,"c2"]')).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("читает то, что сама записала", () => {
    const ids = ["c1", "c2"];
    expect(parseCollapsedColumns(serializeCollapsedColumns(ids))).toEqual(ids);
  });
});

describe("toggleCollapsedColumn", () => {
  it("первое нажатие сворачивает", () => {
    expect(toggleCollapsedColumn([], "c1")).toEqual(["c1"]);
  });

  it("второе разворачивает", () => {
    expect(toggleCollapsedColumn(["c1"], "c1")).toEqual([]);
  });

  it("соседние колонки не трогает", () => {
    expect(toggleCollapsedColumn(["c1", "c2"], "c1")).toEqual(["c2"]);
  });

  it("не меняет исходный список", () => {
    const before = ["c1"];
    toggleCollapsedColumn(before, "c2");
    expect(before).toEqual(["c1"]);
  });
});

describe("expandCollapsedColumn", () => {
  it("разворачивает свёрнутую", () => {
    expect(expandCollapsedColumn(["c1", "c2"], "c2")).toEqual(["c1"]);
  });

  it("развёрнутую оставляет как есть", () => {
    const ids = ["c1"];
    expect(expandCollapsedColumn(ids, "c2")).toBe(ids);
  });
});

describe("everyColumnCollapsed", () => {
  it("узнаёт, что свёрнуто всё", () => {
    expect(everyColumnCollapsed(["c1", "c2"], ["c1", "c2"])).toBe(true);
  });

  it("одна развёрнутая — уже не всё", () => {
    expect(everyColumnCollapsed(["c1"], ["c1", "c2"])).toBe(false);
  });

  it("память о колонке, которой на доске нет, ничего не решает", () => {
    // Колонку удалили, а в хранилище она осталась: доска от этого не
    // становится свёрнутой.
    expect(everyColumnCollapsed(["c1", "ушедшая"], ["c1", "c2"])).toBe(false);
  });

  it("пустая доска не считается свёрнутой: сворачивать нечего", () => {
    expect(everyColumnCollapsed([], [])).toBe(false);
  });
});

describe("toggleAllColumns", () => {
  it("сворачивает всё разом", () => {
    expect(toggleAllColumns([], ["c1", "c2", "c3"])).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
  });

  it("дожимает остаток, когда часть уже свёрнута", () => {
    expect(toggleAllColumns(["c2"], ["c1", "c2"])).toEqual(["c1", "c2"]);
  });

  it("из свёрнутого состояния разворачивает всё", () => {
    expect(toggleAllColumns(["c1", "c2"], ["c1", "c2"])).toEqual([]);
  });

  it("заодно забывает колонки, которых на доске уже нет", () => {
    expect(toggleAllColumns(["ушедшая"], ["c1"])).toEqual(["c1"]);
  });

  it("не меняет исходный список", () => {
    const before = ["c1"];
    toggleAllColumns(before, ["c1", "c2"]);
    expect(before).toEqual(["c1"]);
  });
});
