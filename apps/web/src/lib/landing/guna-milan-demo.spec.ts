import { describe, expect, it } from "vitest";
import {
  ASTRO_COMPATIBILITY_PURPOSES,
  GUNA_MILAN_KOOTA_MAX,
  GUNA_MILAN_MAX_TOTAL,
  PURPOSE_KOOTAS,
  gunaMilanMaxFor,
} from "@vedamatch/shared";
import { demoGunaMilan, demoPurposeNote } from "./guna-milan-demo";

describe("demoGunaMilan", () => {
  it("показывает все восемь кут при любой цели", () => {
    // Спрятать неучтённые значило бы скрыть, чем расчёт для дела короче.
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      expect(demoGunaMilan(purpose).rows).toHaveLength(8);
    }
  });

  it("отмечает учтённые ровно по общей таблице", () => {
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      const counted = demoGunaMilan(purpose)
        .rows.filter((row) => row.counted)
        .map((row) => row.key);
      expect(counted.sort()).toEqual([...PURPOSE_KOOTAS[purpose]].sort());
    }
  });

  it("не меняет очки кут от цели — в сервисе они тоже не зависят", () => {
    const family = demoGunaMilan("family");
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      for (const row of demoGunaMilan(purpose).rows) {
        const same = family.rows.find((r) => r.key === row.key)!;
        expect(row.points).toBe(same.points);
      }
    }
  });

  it("складывает итог ровно из учтённых кут", () => {
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      const score = demoGunaMilan(purpose);
      const expected = score.rows
        .filter((row) => row.counted)
        .reduce((sum, row) => sum + row.points, 0);
      expect(score.totalPoints).toBe(expected);
      expect(score.maxPoints).toBe(gunaMilanMaxFor(purpose));
    }
  });

  it("держит максимум семьи равным традиционным 36", () => {
    expect(demoGunaMilan("family").maxPoints).toBe(GUNA_MILAN_MAX_TOTAL);
  });

  it("не выдаёт куте больше очков, чем её вес", () => {
    for (const row of demoGunaMilan("family").rows) {
      expect(row.points).toBeLessThanOrEqual(GUNA_MILAN_KOOTA_MAX[row.key]);
      expect(row.points).toBeGreaterThanOrEqual(0);
    }
  });

  it("держит процент в шкале", () => {
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      const { percent } = demoGunaMilan(purpose);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });
});

describe("demoPurposeNote", () => {
  it("молчит про семью — там считаются все восемь", () => {
    expect(demoPurposeNote("family")).toBeNull();
  });

  it("называет снятые куты для остальных целей", () => {
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      if (purpose === "family") continue;
      const note = demoPurposeNote(purpose);
      expect(note).toContain("природная близость");
      expect(note).toContain("жизненная энергия");
    }
  });
});
