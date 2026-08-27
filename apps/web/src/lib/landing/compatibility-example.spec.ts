import { describe, expect, it } from "vitest";
import { COMPATIBILITY_CRITERIA } from "@/components/landing/deck-controls";
import { exampleBreakdown, exampleCompatibility } from "./compatibility-example";

/** Итог по весам — та же формула, что у сервера в union-matching.service.ts. */
function weightedTotal(rows: { score: number | null; weight: number }[]): number {
  return rows.reduce((sum, row) => sum + (row.score ?? 0) * row.weight, 0) / 100;
}

const IDS = ["user-1", "user-2", "abc", "", "Ямуна", "0", "d41d8cd98f00b204"];

describe("exampleCompatibility", () => {
  it("постоянен для одной анкеты", () => {
    // Случайное число разошлось бы между сервером и браузером при гидратации.
    for (const id of IDS) {
      expect(exampleCompatibility(id)).toBe(exampleCompatibility(id));
    }
  });

  it("держится в правдоподобном диапазоне", () => {
    for (const id of IDS) {
      const total = exampleCompatibility(id);
      expect(total).toBeGreaterThanOrEqual(74);
      expect(total).toBeLessThanOrEqual(96);
    }
  });

  it("различает анкеты, а не выдаёт всем одно число", () => {
    const values = new Set(IDS.map(exampleCompatibility));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("exampleBreakdown", () => {
  it("сходится с итогом по весам — расчёт не имеет права не сходиться", () => {
    for (const id of IDS) {
      const total = exampleCompatibility(id);
      expect(Math.round(weightedTotal(exampleBreakdown(total)))).toBe(total);
    }
  });

  it("сходится и на краях диапазона", () => {
    for (const total of [0, 50, 74, 96, 100]) {
      expect(Math.round(weightedTotal(exampleBreakdown(total)))).toBe(total);
    }
  });

  it("разбирает по всем критериям расчёта", () => {
    const rows = exampleBreakdown(88);
    expect(rows).toHaveLength(COMPATIBILITY_CRITERIA.length);
    expect(rows.map((row) => row.label)).toEqual(
      COMPATIBILITY_CRITERIA.map((row) => row.label),
    );
  });

  it("даёт полоскам разную длину, а не семь одинаковых", () => {
    const scores = exampleBreakdown(88).map((row) => row.score);
    expect(new Set(scores).size).toBeGreaterThan(3);
  });

  it("держит оценки в пределах шкалы", () => {
    for (const total of [0, 74, 88, 100]) {
      for (const row of exampleBreakdown(total)) {
        expect(row.score).toBeGreaterThanOrEqual(0);
        expect(row.score).toBeLessThanOrEqual(100);
      }
    }
  });
});
