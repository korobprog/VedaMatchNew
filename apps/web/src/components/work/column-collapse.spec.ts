import { describe, expect, it } from "vitest";
import {
  collapsedColumnsKey,
  expandCollapsedColumn,
  parseCollapsedColumns,
  serializeCollapsedColumns,
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
