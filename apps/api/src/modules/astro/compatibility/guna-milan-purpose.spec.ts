import type { AstroCompatibilityPurpose } from '@vedamatch/shared';
import { ASTRO_COMPATIBILITY_PURPOSES } from '@vedamatch/shared';
import {
  computeGunaMilan,
  GUNA_MILAN_MAX_TOTAL,
  maxPointsFor,
  PURPOSE_KOOTAS,
  type MoonPlacement,
} from './guna-milan';

const at = (
  rashi: number,
  nakshatra: number,
  gender: MoonPlacement['gender'] = null,
): MoonPlacement => ({ rashi, nakshatra, gender });

/**
 * Цель меняет не астрономию, а состав кут в итоге. Тесты держат именно это:
 * очки каждой куты обязаны совпадать при любой цели, а различаться должны
 * только сумма, максимум и отметка «учтено».
 */
describe('гуна-милан по целям', () => {
  it('семья считается по-сватовски: все восемь кут и максимум 36', () => {
    const score = computeGunaMilan(at(1, 1), at(3, 5), 'family');
    expect(score.maxPoints).toBe(GUNA_MILAN_MAX_TOTAL);
    expect(score.kootas.every((k) => k.counted)).toBe(true);
  });

  it('без указания цели считает как для семьи — так было до появления целей', () => {
    expect(computeGunaMilan(at(1, 1), at(3, 5))).toEqual(
      computeGunaMilan(at(1, 1), at(3, 5), 'family'),
    );
  });

  it('снимает йони и надь со всех целей, кроме семьи', () => {
    // Йони — о телесной близости, надь — о жизненной силе и потомстве;
    // деловому партнёрству они отвечают не на тот вопрос.
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      if (purpose === 'family') continue;
      expect(PURPOSE_KOOTAS[purpose]).not.toContain('yoni');
      expect(PURPOSE_KOOTAS[purpose]).not.toContain('nadi');
    }
  });

  it('оставляет согласие нравов в любой цели', () => {
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      for (const key of ['temperament', 'tara', 'grahaMaitri', 'gana']) {
        expect(PURPOSE_KOOTAS[purpose]).toContain(key);
      }
    }
  });

  it('оставляет достаток делу и снимает его со служения', () => {
    expect(PURPOSE_KOOTAS.business).toContain('bhakoot');
    expect(PURPOSE_KOOTAS.service).not.toContain('bhakoot');
  });

  it('у каждой цели свой максимум, и он равен сумме её кут', () => {
    const maxima: Record<AstroCompatibilityPurpose, number> = {
      family: 36,
      business: 24,
      friendship: 17,
      service: 15,
    };
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      expect(maxPointsFor(purpose)).toBe(maxima[purpose]);
    }
  });

  it('не даёт цели поменять очки самих кут — астрономия одна', () => {
    const family = computeGunaMilan(at(2, 7), at(9, 18), 'family');
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      const score = computeGunaMilan(at(2, 7), at(9, 18), purpose);
      for (const koota of score.kootas) {
        const same = family.kootas.find((k) => k.key === koota.key)!;
        expect(koota.points).toBe(same.points);
      }
    }
  });

  it('возвращает и неучтённые куты — иначе не видно, что расчёт короче', () => {
    const score = computeGunaMilan(at(2, 7), at(9, 18), 'service');
    expect(score.kootas).toHaveLength(8);
    expect(score.kootas.filter((k) => !k.counted).length).toBeGreaterThan(0);
  });

  it('складывает в итог ровно учтённые куты', () => {
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      const score = computeGunaMilan(at(4, 11), at(7, 22), purpose);
      const expected = score.kootas
        .filter((k) => k.counted)
        .reduce((sum, k) => sum + k.points, 0);
      expect(score.totalPoints).toBe(expected);
      expect(score.maxPoints).toBe(maxPointsFor(purpose));
    }
  });

  it('держит процент в шкале и считает его от максимума цели', () => {
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      const score = computeGunaMilan(at(1, 1), at(1, 1), purpose);
      expect(score.percent).toBe(
        Math.round((score.totalPoints / score.maxPoints) * 100),
      );
      expect(score.percent).toBeGreaterThanOrEqual(0);
      expect(score.percent).toBeLessThanOrEqual(100);
    }
  });

  it('сообщает цель в ответе — по ней подписывают шкалу', () => {
    for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
      expect(computeGunaMilan(at(1, 1), at(2, 2), purpose).purpose).toBe(
        purpose,
      );
    }
  });
});
