import { describe, expect, it } from "vitest";
import { EQ_MIN_WIDTH, eqBarCount, eqFits, eqRightPadding } from "./eq-fit";

describe("eqBarCount (VED-450)", () => {
  it("уже порога — не рисуем", () => {
    expect(eqBarCount(0)).toBe(0);
    expect(eqBarCount(EQ_MIN_WIDTH - 1)).toBe(0);
    expect(eqBarCount(Number.NaN)).toBe(0);
  });

  it("шаг постоянный: шире ряд — больше столбиков, а не реже", () => {
    // 3 точки столбик + 4 зазор: n столбиков занимают 7n − 4.
    expect(eqBarCount(40)).toBe(6);
    expect(eqBarCount(94)).toBe(14);
    expect(eqBarCount(200)).toBe(29);
    for (const width of [40, 57, 94, 131, 200, 263]) {
      const n = eqBarCount(width);
      expect(7 * n - 4).toBeLessThanOrEqual(width);
      expect(7 * (n + 1) - 4).toBeGreaterThan(width);
    }
  });
});

describe("eqFits (VED-450)", () => {
  it("встаёт, пока после кнопок и полей остаётся порог", () => {
    expect(eqFits(200, 80, 24)).toBe(true);
    expect(eqFits(200, 200 - 24 - EQ_MIN_WIDTH, 24)).toBe(true);
    expect(eqFits(200, 200 - 24 - EQ_MIN_WIDTH + 1, 24)).toBe(false);
  });
});

describe("eqRightPadding (VED-450, круг 7)", () => {
  it("у перемотки значок у края — поле больше, у значковых кнопок меньше", () => {
    expect(eqRightPadding("seek")).toBeGreaterThan(eqRightPadding("strip"));
    expect(eqRightPadding("strip")).toBeGreaterThanOrEqual(
      eqRightPadding("icon"),
    );
  });
});
