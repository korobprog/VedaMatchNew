import { AstronomiaEphemerisProvider } from '../ephemeris/astronomia-provider';
import { buildVedicChart } from '../vedic/vedic-chart';
import {
  TRANSIT_MAX_AT,
  TRANSIT_MIN_AT,
  computeTransitPositions,
  parseTransitMoment,
} from './transit-positions';

const ephemeris = new AstronomiaEphemerisProvider();

const MOSCOW_1987 = {
  bornAtUtc: new Date('1987-05-12T02:20:00.000Z'),
  latitude: 55.7558,
  longitude: 37.6173,
  timeAccuracy: 'exact' as const,
};

describe('computeTransitPositions', () => {
  /**
   * Транзит на момент рождения обязан совпасть с натальной картой: расчёт
   * тот же, и если он разойдётся, разошлась формула, а не транзиты.
   */
  it('на момент рождения совпадает с натальными грахами', () => {
    const chart = buildVedicChart(ephemeris, {
      ...MOSCOW_1987,
      now: MOSCOW_1987.bornAtUtc,
    });
    const transit = computeTransitPositions(ephemeris, MOSCOW_1987.bornAtUtc);

    expect(transit.ayanamsa).toBeCloseTo(chart.ayanamsa, 12);
    expect(transit.grahas.map((g) => g.graha)).toEqual(
      chart.grahas.map((g) => g.graha),
    );
    for (const natal of chart.grahas) {
      const moving = transit.grahas.find((g) => g.graha === natal.graha)!;
      expect(moving.longitude).toBeCloseTo(natal.longitude, 9);
      expect(moving.rashi).toBe(natal.rashi);
      expect(moving.nakshatra).toBe(natal.nakshatra);
      expect(moving.navamsaRashi).toBe(natal.navamsaRashi);
      expect(moving.retrograde).toBe(natal.retrograde);
    }
  });

  it('отдаёт все девять грах с согласованными делениями', () => {
    const transit = computeTransitPositions(
      ephemeris,
      new Date('2026-09-28T12:00:00Z'),
    );
    expect(transit.at).toBe('2026-09-28T12:00:00.000Z');
    expect(transit.grahas).toHaveLength(9);
    for (const graha of transit.grahas) {
      expect(graha.longitude).toBeGreaterThanOrEqual(0);
      expect(graha.longitude).toBeLessThan(360);
      expect((graha.rashi - 1) * 30 + graha.degreeInRashi).toBeCloseTo(
        graha.longitude,
        9,
      );
      expect(graha.navamsaRashi).toBeGreaterThanOrEqual(1);
      expect(graha.navamsaRashi).toBeLessThanOrEqual(12);
    }
  });

  it('узлы стоят друг напротив друга', () => {
    const transit = computeTransitPositions(
      ephemeris,
      new Date('2026-09-28T12:00:00Z'),
    );
    const rahu = transit.grahas.find((g) => g.graha === 'rahu')!;
    const ketu = transit.grahas.find((g) => g.graha === 'ketu')!;
    expect((((rahu.longitude - ketu.longitude) % 360) + 360) % 360).toBeCloseTo(
      180,
      6,
    );
  });
});

describe('parseTransitMoment', () => {
  const now = new Date('2026-09-28T09:15:00Z');

  it('без параметра — сейчас', () => {
    expect(parseTransitMoment(undefined, now)).toBe(now);
    expect(parseTransitMoment('', now)).toBe(now);
    expect(parseTransitMoment('  ', now)).toBe(now);
  });

  it('принимает ISO-дату и дату со временем', () => {
    expect(parseTransitMoment('2027-01-01', now)?.toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
    expect(
      parseTransitMoment('2027-01-01T10:30:00+03:00', now)?.toISOString(),
    ).toBe('2027-01-01T07:30:00.000Z');
  });

  it('отвергает не-даты, а не подменяет их текущим моментом', () => {
    expect(parseTransitMoment('завтра', now)).toBeNull();
    expect(parseTransitMoment('5', now)).toBeNull();
    expect(parseTransitMoment('2027-13-45', now)).toBeNull();
  });

  it('отвергает моменты за пределами границ', () => {
    expect(parseTransitMoment('1899-12-31T23:59:59Z', now)).toBeNull();
    expect(parseTransitMoment('2101-01-01T00:00:00Z', now)).toBeNull();
    expect(parseTransitMoment(TRANSIT_MIN_AT.toISOString(), now)).toEqual(
      TRANSIT_MIN_AT,
    );
    expect(parseTransitMoment(TRANSIT_MAX_AT.toISOString(), now)).toEqual(
      TRANSIT_MAX_AT,
    );
  });
});
