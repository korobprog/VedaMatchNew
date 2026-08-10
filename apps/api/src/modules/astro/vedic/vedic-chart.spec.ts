import { AstronomiaEphemerisProvider } from '../ephemeris/astronomia-provider';
import { buildVedicChart, chartFingerprint } from './vedic-chart';
import { wholeSignBhava } from './rashi';

const ephemeris = new AstronomiaEphemerisProvider();

const MOSCOW_1987 = {
  bornAtUtc: new Date('1987-05-12T02:20:00.000Z'),
  latitude: 55.7558,
  longitude: 37.6173,
  timeAccuracy: 'exact' as const,
  now: new Date('2026-08-09T00:00:00Z'),
};

describe('сборка ведической карты', () => {
  const chart = buildVedicChart(ephemeris, MOSCOW_1987);

  it('содержит все девять грах', () => {
    expect(chart.grahas).toHaveLength(9);
    expect(chart.grahas.map((g) => g.graha)).toContain('ketu');
  });

  it('сидерические долготы отстоят от тропических ровно на аянамшу', () => {
    const tropical = ephemeris.positions(MOSCOW_1987.bornAtUtc);
    for (const graha of chart.grahas) {
      const source = tropical.find((p) => p.body === graha.graha)!;
      const delta = ((source.longitude - graha.longitude + 540) % 360) - 180;
      expect(delta).toBeCloseTo(chart.ayanamsa, 9);
    }
  });

  it('градус внутри знака согласован с долготой и знаком', () => {
    for (const graha of chart.grahas) {
      expect(graha.degreeInRashi).toBeGreaterThanOrEqual(0);
      expect(graha.degreeInRashi).toBeLessThan(30);
      expect(graha.rashi).toBe(Math.floor(graha.longitude / 30) + 1);
    }
  });

  it('бхавы согласованы с лагной по правилу целых знаков', () => {
    for (const graha of chart.grahas) {
      expect(graha.bhava).toBe(wholeSignBhava(graha.rashi, chart.lagna!.rashi));
    }
  });

  it('Кету стоит ровно напротив Раху и в противоположном знаке', () => {
    const rahu = chart.grahas.find((g) => g.graha === 'rahu')!;
    const ketu = chart.grahas.find((g) => g.graha === 'ketu')!;
    expect((ketu.longitude - rahu.longitude + 360) % 360).toBeCloseTo(180, 9);
    expect(ketu.rashi).toBe(((rahu.rashi + 5) % 12) + 1);
  });

  it('Солнце не бывает сожжённым, узлы тоже', () => {
    for (const graha of ['sun', 'rahu', 'ketu'] as const) {
      expect(chart.grahas.find((g) => g.graha === graha)!.combust).toBe(false);
    }
  });

  it('сожжение согласовано с расстоянием до Солнца', () => {
    const sun = chart.grahas.find((g) => g.graha === 'sun')!;
    for (const graha of chart.grahas) {
      if (graha.combust) {
        const separation = Math.abs(
          ((graha.longitude - sun.longitude + 540) % 360) - 180,
        );
        expect(separation).toBeLessThan(17);
      }
    }
  });

  it('Солнце и Луна никогда не ретроградны', () => {
    expect(chart.grahas.find((g) => g.graha === 'sun')!.retrograde).toBe(false);
    expect(chart.grahas.find((g) => g.graha === 'moon')!.retrograde).toBe(
      false,
    );
  });

  it('Раху и Кету всегда ретроградны: узлы отступают', () => {
    expect(chart.grahas.find((g) => g.graha === 'rahu')!.retrograde).toBe(true);
    expect(chart.grahas.find((g) => g.graha === 'ketu')!.retrograde).toBe(true);
  });

  it('накшатра Луны совпадает с накшатрой в списке грах', () => {
    const moon = chart.grahas.find((g) => g.graha === 'moon')!;
    expect(chart.moonNakshatra).toBe(moon.nakshatra);
  });

  it('даши отсчитываются от рождения', () => {
    expect(chart.dasha!.mahadashas[0].startsAt).toBe(
      MOSCOW_1987.bornAtUtc.toISOString(),
    );
  });
});

describe('неизвестное время рождения', () => {
  const chart = buildVedicChart(ephemeris, {
    ...MOSCOW_1987,
    timeAccuracy: 'unknown',
  });

  it('лагна не выдаётся: за сутки асцендент обходит весь круг', () => {
    expect(chart.lagna).toBeNull();
  });

  it('бхав нет ни у одной грахи', () => {
    for (const graha of chart.grahas) {
      expect(graha.bhava).toBeNull();
    }
  });

  it('даши не выдаются: Луна за сутки проходит больше накшатры', () => {
    expect(chart.dasha).toBeNull();
  });

  it('знаки грах при этом остаются — они от часа почти не зависят', () => {
    expect(chart.grahas.every((g) => g.rashi >= 1 && g.rashi <= 12)).toBe(true);
  });
});

describe('отпечаток карты', () => {
  it('детерминирован: одинаковый вход даёт одинаковый ключ', () => {
    expect(chartFingerprint('v1', MOSCOW_1987)).toBe(
      chartFingerprint('v1', MOSCOW_1987),
    );
  });

  it('меняется вместе с версией движка', () => {
    expect(chartFingerprint('v1', MOSCOW_1987)).not.toBe(
      chartFingerprint('v2', MOSCOW_1987),
    );
  });

  it('меняется при сдвиге момента рождения', () => {
    expect(
      chartFingerprint('v1', {
        ...MOSCOW_1987,
        bornAtUtc: new Date('1987-05-12T02:21:00.000Z'),
      }),
    ).not.toBe(chartFingerprint('v1', MOSCOW_1987));
  });

  it('меняется при смене места', () => {
    expect(
      chartFingerprint('v1', { ...MOSCOW_1987, latitude: 55.7559 }),
    ).not.toBe(chartFingerprint('v1', MOSCOW_1987));
  });

  it('меняется при смене точности времени: от неё зависит наличие лагны', () => {
    expect(
      chartFingerprint('v1', { ...MOSCOW_1987, timeAccuracy: 'unknown' }),
    ).not.toBe(chartFingerprint('v1', MOSCOW_1987));
  });

  it('не зависит от момента, на который смотрят даши', () => {
    expect(
      chartFingerprint('v1', { ...MOSCOW_1987, now: new Date('2030-01-01') }),
    ).toBe(chartFingerprint('v1', MOSCOW_1987));
  });
});
