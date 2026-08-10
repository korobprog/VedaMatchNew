import { AstronomiaEphemerisProvider } from '../ephemeris/astronomia-provider';
import { buildVedicChart } from '../vedic/vedic-chart';
import { computeTransitFacts, transitPatternKey } from './transit-facts';

const ephemeris = new AstronomiaEphemerisProvider();

const MOSCOW_1987 = {
  bornAtUtc: new Date('1987-05-12T02:20:00.000Z'),
  latitude: 55.7558,
  longitude: 37.6173,
  timeAccuracy: 'exact' as const,
};

describe('computeTransitFacts', () => {
  /**
   * Самая сильная проверка здесь — не новая арифметика, а согласованность со
   * старой: транзитная Луна В МОМЕНТ РОЖДЕНИЯ обязана совпасть с натальной
   * Луной уже построенной карты. Если это разойдётся, разошлась сама формула
   * положения Луны или аянамши, а не что-то специфичное для транзитов.
   */
  it('на момент рождения совпадает с натальной Луной этой же карты', () => {
    const chart = buildVedicChart(ephemeris, {
      ...MOSCOW_1987,
      now: MOSCOW_1987.bornAtUtc,
    });
    const natalMoon = chart.grahas.find((g) => g.graha === 'moon')!;

    const facts = computeTransitFacts(
      ephemeris,
      MOSCOW_1987.bornAtUtc,
      chart.lagna!.rashi,
    );

    expect(facts.moonRashi).toBe(natalMoon.rashi);
    expect(facts.moonNakshatra).toBe(natalMoon.nakshatra);
    expect(facts.moonBhava).toBe(natalMoon.bhava);
  });

  it('бхава остаётся в диапазоне 1..12 в любой день', () => {
    for (const iso of [
      '2000-01-01T00:00:00Z',
      '2026-08-10T12:00:00Z',
      '2030-06-15T18:00:00Z',
    ]) {
      const facts = computeTransitFacts(ephemeris, new Date(iso), 5);
      expect(facts.moonBhava).toBeGreaterThanOrEqual(1);
      expect(facts.moonBhava).toBeLessThanOrEqual(12);
    }
  });

  it('лагна в знаке транзитной Луны всегда даёт первую бхаву', () => {
    // Определение бхавы: собственный знак лагны — всегда дом 1.
    const at = new Date('2026-08-10T00:00:00Z');
    const facts = computeTransitFacts(ephemeris, at, 1);
    const bareRashi = computeTransitFacts(ephemeris, at, facts.moonRashi);
    expect(bareRashi.moonBhava).toBe(1);
  });

  it('за сутки Луна не может перескочить больше чем на одну бхаву', () => {
    const day1 = computeTransitFacts(
      ephemeris,
      new Date('2026-08-10T00:00:00Z'),
      5,
    );
    const day2 = computeTransitFacts(
      ephemeris,
      new Date('2026-08-11T00:00:00Z'),
      5,
    );
    const delta = (day2.moonBhava - day1.moonBhava + 12) % 12;
    expect(delta === 0 || delta === 1).toBe(true);
  });
});

describe('transitPatternKey', () => {
  it('зависит только от бхавы, а не от знака или накшатры', () => {
    const key = transitPatternKey({ moonBhava: 7 });
    expect(key).toBe('moon|bhava:7');
  });

  it('один и тот же ключ у разных людей с одинаковой бхавой транзита', () => {
    // Экономика фразы держится на этом: ключ не содержит ни userId, ни знака.
    const a = transitPatternKey({ moonBhava: 3 });
    const b = transitPatternKey({ moonBhava: 3 });
    expect(a).toBe(b);
  });

  it('разные бхавы дают разные ключи', () => {
    expect(transitPatternKey({ moonBhava: 1 })).not.toBe(
      transitPatternKey({ moonBhava: 2 }),
    );
  });
});
