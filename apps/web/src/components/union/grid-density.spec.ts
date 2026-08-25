import { describe, expect, it } from "vitest";
import {
  DEFAULT_DENSITY,
  densityClassName,
  densityLabel,
  nextDensity,
  parseDensity,
} from "./grid-density";

describe("nextDensity", () => {
  // Кнопка одна, поэтому нажатие должно возвращать к исходному состоянию:
  // иначе выбранную плотность нельзя вернуть тем же способом.
  it("cycles back and forth with a single button", () => {
    expect(nextDensity(2)).toBe(3);
    expect(nextDensity(3)).toBe(2);
    expect(nextDensity(nextDensity(2))).toBe(2);
  });
});

describe("parseDensity", () => {
  it("restores a saved choice", () => {
    expect(parseDensity("3")).toBe(3);
    expect(parseDensity("2")).toBe(2);
  });

  // Риск: чужое или испорченное значение в localStorage не должно ломать
  // сетку — список важнее сохранённого выбора.
  it("falls back to the default on anything unexpected", () => {
    expect(parseDensity(null)).toBe(DEFAULT_DENSITY);
    expect(parseDensity("")).toBe(DEFAULT_DENSITY);
    expect(parseDensity("42")).toBe(DEFAULT_DENSITY);
    expect(parseDensity("{}")).toBe(DEFAULT_DENSITY);
  });
});

describe("densityClassName", () => {
  // Tailwind сканирует исходники строками: `grid-cols-${n}` в сборку не
  // попадёт, поэтому классы обязаны быть записаны целиком.
  it("spells the column classes out in full", () => {
    expect(densityClassName(2)).toContain("grid-cols-2");
    expect(densityClassName(3)).toContain("grid-cols-3");
  });
});

describe("densityLabel", () => {
  // Подпись обещает результат нажатия, а не описывает текущее состояние:
  // «Плотнее» на уже плотной сетке сбивало бы с толку.
  it("names what the press will do, not what is shown now", () => {
    expect(densityLabel(2)).toBe("Плотнее");
    expect(densityLabel(3)).toBe("Крупнее");
  });

  // Подпись стоит под значком в узкой квадратной кнопке: два слова туда уже
  // не помещаются и переносом ломают ряд.
  it("stays short enough to sit under an icon", () => {
    for (const density of [2, 3] as const) {
      expect(densityLabel(density).split(" ")).toHaveLength(1);
    }
  });
});
