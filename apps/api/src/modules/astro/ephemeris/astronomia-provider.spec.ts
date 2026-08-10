import {
  AstronomiaEphemerisProvider,
  angularDelta,
} from './astronomia-provider';
import type { GrahaId } from './ephemeris-provider';

const provider = new AstronomiaEphemerisProvider();
const ARCSEC = 1 / 3600;

const longitudeOf = (at: Date, body: GrahaId) =>
  provider.positions(at).find((p) => p.body === body)!.longitude;

/**
 * Эталон — видимая эклиптическая долгота на дату (величина 31) из JPL Horizons,
 * сервиса NASA. Это внешняя истина, а не значения, снятые с самой библиотеки:
 * тест, зафиксировавший собственный вывод, подтверждает лишь неизменность, но не
 * правильность. Эпохи покрывают диапазон 1879–2026, включая до-1900 год.
 */
const JPL_HORIZONS: Record<string, Partial<Record<GrahaId, number>>> = {
  '1879-03-14T10:30:00Z': {
    sun: 353.493831,
    moon: 254.332476,
    mercury: 3.11669,
    venus: 16.967817,
    mars: 296.904018,
    jupiter: 327.480863,
    saturn: 4.188018,
  },
  '1950-06-15T08:00:00Z': {
    sun: 83.650545,
    moon: 79.976936,
    mercury: 60.889079,
    venus: 45.847182,
    mars: 181.309333,
    jupiter: 337.233949,
    saturn: 163.394769,
  },
  '2000-01-01T12:00:00Z': {
    sun: 280.368909,
    moon: 223.323786,
    mercury: 271.88927,
    venus: 241.565779,
    mars: 327.963292,
    jupiter: 25.253069,
    saturn: 40.395637,
  },
  '2026-08-09T00:00:00Z': {
    sun: 136.449602,
    moon: 85.256563,
    mercury: 118.937296,
    venus: 182.207696,
    mars: 88.435456,
    jupiter: 128.729446,
    saturn: 14.602607,
  },
};

describe('AstronomiaEphemerisProvider — точность против JPL Horizons', () => {
  // 10″ при паде в 3°20′ (12000″) — запас больше тысячи крат. Порог держим жёстким
  // именно потому, что он не мешает: его срабатывание означает поломку, а не дрейф.
  const TOLERANCE_ARCSEC = 10;

  for (const [iso, expected] of Object.entries(JPL_HORIZONS)) {
    describe(iso, () => {
      const positions = provider.positions(new Date(iso));

      for (const [body, truth] of Object.entries(expected) as [
        GrahaId,
        number,
      ][]) {
        it(`${body} сходится с эталоном`, () => {
          const actual = positions.find((p) => p.body === body)!.longitude;
          const deviation = Math.abs(angularDelta(actual, truth)) / ARCSEC;
          expect(deviation).toBeLessThan(TOLERANCE_ARCSEC);
        });
      }
    });
  }
});

describe('AstronomiaEphemerisProvider — физические инварианты', () => {
  const at = new Date('2026-08-09T00:00:00Z');
  const positions = provider.positions(at);
  const speedOf = (body: GrahaId) =>
    positions.find((p) => p.body === body)!.speed;

  it('возвращает все девять грах', () => {
    expect(positions.map((p) => p.body).sort()).toEqual(
      [
        'jupiter',
        'ketu',
        'mars',
        'mercury',
        'moon',
        'rahu',
        'saturn',
        'sun',
        'venus',
      ].sort(),
    );
  });

  it('все долготы лежат в [0, 360)', () => {
    for (const p of positions) {
      expect(p.longitude).toBeGreaterThanOrEqual(0);
      expect(p.longitude).toBeLessThan(360);
    }
  });

  // Ловит ошибки в единицах измерения: перепутанные градусы и радианы дают скорость
  // мимо этих границ на два порядка, а по одной долготе такое не видно.
  it('Солнце проходит около градуса в сутки и никогда не ретроградно', () => {
    expect(speedOf('sun')).toBeGreaterThan(0.95);
    expect(speedOf('sun')).toBeLessThan(1.02);
  });

  it('Луна проходит 11–15 градусов в сутки и никогда не ретроградна', () => {
    expect(speedOf('moon')).toBeGreaterThan(11);
    expect(speedOf('moon')).toBeLessThan(15);
  });

  it('Раху всегда ретрограден: средний узел отступает примерно 0.053° в сутки', () => {
    expect(speedOf('rahu')).toBeLessThan(0);
    expect(Math.abs(speedOf('rahu') + 0.0529539)).toBeLessThan(0.001);
  });

  it('Кету стоит ровно напротив Раху', () => {
    const rahu = positions.find((p) => p.body === 'rahu')!.longitude;
    const ketu = positions.find((p) => p.body === 'ketu')!.longitude;
    expect(Math.abs(angularDelta(ketu, rahu + 180))).toBeLessThan(1e-9);
  });

  it('ретроградность определяется знаком скорости', () => {
    // Сатурн в противостоянии движется попятно; проверяем согласованность знака
    // с фактическим изменением долготы за сутки, а не запомненную дату.
    const day = 24 * 60 * 60 * 1000;
    for (const body of [
      'mercury',
      'venus',
      'mars',
      'jupiter',
      'saturn',
    ] as const) {
      const before = longitudeOf(new Date(at.getTime() - day), body);
      const after = longitudeOf(new Date(at.getTime() + day), body);
      expect(Math.sign(speedOf(body))).toBe(
        Math.sign(angularDelta(after, before)),
      );
    }
  });
});

describe('AstronomiaEphemerisProvider — асцендент', () => {
  const RAD = Math.PI / 180;

  /**
   * Независимый численный поиск восходящей точки. Асцендент — куспид первого дома,
   * а дома 1–6 лежат под горизонтом: значит при возрастании долготы высота точки
   * эклиптики пересекает ноль СВЕРХУ ВНИЗ. Восходящее пересечение — это десцендент,
   * ровно на 180° в стороне.
   */
  function ascendantByRootFinding(lst: number, obliquity: number, lat: number) {
    const altitude = (lambda: number) => {
      const l = lambda * RAD;
      const e = obliquity * RAD;
      const p = lat * RAD;
      const ra = Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l));
      const dec = Math.asin(Math.sin(l) * Math.sin(e));
      const hourAngle = lst * RAD - ra;
      return Math.asin(
        Math.sin(p) * Math.sin(dec) +
          Math.cos(p) * Math.cos(dec) * Math.cos(hourAngle),
      );
    };

    const step = 0.01;
    for (let l = 0; l < 360; l += step) {
      if (altitude(l) > 0 && altitude(l + step) <= 0) {
        let lo = l;
        let hi = l + step;
        for (let i = 0; i < 80; i++) {
          const mid = (lo + hi) / 2;
          if (altitude(mid) > 0) lo = mid;
          else hi = mid;
        }
        return (lo + hi) / 2;
      }
    }
    throw new Error('точка восхода не найдена');
  }

  const CASES = [
    { name: 'Москва', iso: '1987-05-12T03:20:00Z', lat: 55.7558, lon: 37.6173 },
    { name: 'Мумбаи', iso: '1994-11-02T19:45:00Z', lat: 19.076, lon: 72.8777 },
    {
      name: 'Ульм 1879',
      iso: '1879-03-14T10:30:00Z',
      lat: 48.4011,
      lon: 9.9876,
    },
    {
      name: 'Кито (экватор)',
      iso: '2005-01-01T00:00:00Z',
      lat: -0.1807,
      lon: -78.4678,
    },
    {
      name: 'Рейкьявик (64°с.ш.)',
      iso: '2010-12-21T09:00:00Z',
      lat: 64.1466,
      lon: -21.9426,
    },
    {
      name: 'Сидней (юг)',
      iso: '2001-07-04T14:10:00Z',
      lat: -33.8688,
      lon: 151.2093,
    },
  ];

  for (const c of CASES) {
    it(`замкнутая формула совпадает с численным поиском: ${c.name}`, () => {
      const { ascendant, obliquity, localSiderealTime } = provider.angles(
        new Date(c.iso),
        c.lat,
        c.lon,
      );
      const numeric = ascendantByRootFinding(
        localSiderealTime,
        obliquity,
        c.lat,
      );
      expect(Math.abs(angularDelta(ascendant, numeric)) / ARCSEC).toBeLessThan(
        1,
      );
    });
  }

  it('MC поднят над горизонтом, а асцендент стоит на нём', () => {
    const { ascendant, midheaven } = provider.angles(
      new Date('1987-05-12T03:20:00Z'),
      55.7558,
      37.6173,
    );
    // MC предшествует асценденту по зодиакальному порядку (дома 10 → 11 → 12 → 1).
    expect(angularDelta(ascendant, midheaven)).toBeGreaterThan(0);
    expect(angularDelta(ascendant, midheaven)).toBeLessThan(180);
  });

  it('истинный наклон эклиптики около 23.44° и медленно убывает', () => {
    const past = provider.angles(
      new Date('1879-03-14T10:30:00Z'),
      0,
      0,
    ).obliquity;
    const now = provider.angles(
      new Date('2026-08-09T00:00:00Z'),
      0,
      0,
    ).obliquity;
    expect(now).toBeGreaterThan(23.4);
    expect(now).toBeLessThan(23.5);
    expect(now).toBeLessThan(past);
  });
});
