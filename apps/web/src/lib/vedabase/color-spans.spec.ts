import { describe, expect, it } from "vitest";
import { paintRange } from "./color-spans";

/* VED-683: редактор цветного перевода. */
describe("paintRange", () => {
  it("красит пустой блок", () => {
    expect(paintRange([], 2, 5, "red")).toEqual([
      { start: 2, end: 5, color: "red" },
    ]);
  });

  it("новый цвет вырезает место в старом отрезке", () => {
    expect(
      paintRange([{ start: 0, end: 10, color: "red" }], 3, 6, "blue"),
    ).toEqual([
      { start: 0, end: 3, color: "red" },
      { start: 3, end: 6, color: "blue" },
      { start: 6, end: 10, color: "red" },
    ]);
  });

  it("стирание убирает цвет только внутри выделения", () => {
    expect(
      paintRange([{ start: 0, end: 10, color: "red" }], 2, 12, null),
    ).toEqual([{ start: 0, end: 2, color: "red" }]);
  });

  it("соседние отрезки одного цвета склеиваются", () => {
    expect(
      paintRange([{ start: 0, end: 3, color: "green" }], 3, 7, "green"),
    ).toEqual([{ start: 0, end: 7, color: "green" }]);
  });

  it("пустое выделение ничего не меняет", () => {
    const spans = [{ start: 0, end: 3, color: "gold" as const }];
    expect(paintRange(spans, 4, 4, "red")).toEqual(spans);
  });
});
