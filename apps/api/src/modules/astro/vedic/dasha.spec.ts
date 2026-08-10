import {
  DASHA_YEAR_DAYS,
  VIMSHOTTARI_TOTAL_YEARS,
  antardashas,
  dashaState,
  mahadashas,
  nakshatraLord,
} from './dasha';
import { NAKSHATRA_SIZE } from './rashi';

const BORN = new Date('1987-05-12T02:20:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const years = (ms: number) => ms / (DASHA_YEAR_DAYS * DAY_MS);
const span = (period: { startsAt: string; endsAt: string }) =>
  new Date(period.endsAt).getTime() - new Date(period.startsAt).getTime();

describe('вимшоттари — устройство цикла', () => {
  it('цикл длится ровно 120 лет, отсюда и название', () => {
    expect(VIMSHOTTARI_TOTAL_YEARS).toBe(120);
  });

  it('Ашвини принадлежит Кету, дальше порядок повторяется через девять', () => {
    expect(nakshatraLord(1)).toBe('ketu');
    expect(nakshatraLord(2)).toBe('venus');
    expect(nakshatraLord(10)).toBe('ketu');
    expect(nakshatraLord(19)).toBe('ketu');
  });

  it('девять владык покрывают все двадцать семь накшатр без пропусков', () => {
    const lords = new Set(
      Array.from({ length: 27 }, (_, i) => nakshatraLord(i + 1)),
    );
    expect(lords.size).toBe(9);
  });
});

describe('махадаши', () => {
  it('рождение в самом начале накшатры даёт полный первый период', () => {
    // Луна в 0° Ашвини — период Кету не начался расходоваться.
    const periods = mahadashas(BORN, 0);
    expect(periods[0].lord).toBe('ketu');
    expect(years(span(periods[0]))).toBeCloseTo(7, 6);
  });

  it('первый период урезан на уже пройденную долю накшатры', () => {
    // Ровно середина Ашвини: от семи лет Кету осталась половина.
    const periods = mahadashas(BORN, NAKSHATRA_SIZE / 2);
    expect(years(span(periods[0]))).toBeCloseTo(3.5, 6);
  });

  it('последующие периоды идут полной длительности в каноническом порядке', () => {
    const periods = mahadashas(BORN, NAKSHATRA_SIZE / 2);
    expect(periods.map((p) => p.lord)).toEqual([
      'ketu',
      'venus',
      'sun',
      'moon',
      'mars',
      'rahu',
      'jupiter',
      'saturn',
      'mercury',
    ]);
    expect(years(span(periods[1]))).toBeCloseTo(20, 6);
    expect(years(span(periods[8]))).toBeCloseTo(17, 6);
  });

  it('периоды идут встык, без разрывов и наложений', () => {
    const periods = mahadashas(BORN, 123.456);
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].startsAt).toBe(periods[i - 1].endsAt);
    }
    expect(periods[0].startsAt).toBe(BORN.toISOString());
  });

  it('полный цикл от рождения короче 120 лет ровно на пройденную часть', () => {
    const full = mahadashas(BORN, 0);
    const total =
      new Date(full[8].endsAt).getTime() - new Date(full[0].startsAt).getTime();
    expect(years(total)).toBeCloseTo(120, 6);
  });
});

describe('антардаши', () => {
  const [firstFull] = mahadashas(BORN, 0);

  it('начинаются с владыки самой махадаши', () => {
    expect(antardashas(firstFull)[0].lord).toBe('ketu');
  });

  it('в сумме занимают всю махадашу и не выходят за её конец', () => {
    const periods = antardashas(firstFull);
    expect(periods[0].startsAt).toBe(firstFull.startsAt);
    expect(periods[periods.length - 1].endsAt).toBe(firstFull.endsAt);
  });

  it('длительность пропорциональна доле подпериода в 120-летнем круге', () => {
    // Внутри семилетнего Кету доля Венеры — 20/120 от семи лет.
    const venus = antardashas(firstFull).find((p) => p.lord === 'venus')!;
    expect(years(span(venus))).toBeCloseTo((7 * 20) / 120, 6);
  });

  it('у урезанной первой махадаши подпериоды сжимаются в той же пропорции', () => {
    // Иначе они вышли бы за её конец: период короче, а сумма долей та же.
    const [halved] = mahadashas(BORN, NAKSHATRA_SIZE / 2);
    const periods = antardashas(halved);
    expect(periods[periods.length - 1].endsAt).toBe(halved.endsAt);
    const venus = periods.find((p) => p.lord === 'venus')!;
    expect(years(span(venus))).toBeCloseTo((7 * 20) / 120 / 2, 6);
  });
});

describe('текущая даша', () => {
  it('находит период, накрывающий заданный момент', () => {
    const state = dashaState(BORN, 0, new Date('1990-01-01T00:00:00Z'))!;
    expect(state.currentMahadasha.lord).toBe('ketu');
    expect(new Date(state.currentMahadasha.endsAt).getTime()).toBeGreaterThan(
      new Date('1990-01-01T00:00:00Z').getTime(),
    );
  });

  it('текущая антардаша лежит внутри текущей махадаши', () => {
    const now = new Date('2026-08-09T00:00:00Z');
    const state = dashaState(BORN, 123.456, now)!;
    expect(
      new Date(state.currentAntardasha.startsAt).getTime(),
    ).toBeGreaterThanOrEqual(
      new Date(state.currentMahadasha.startsAt).getTime(),
    );
    expect(
      new Date(state.currentAntardasha.endsAt).getTime(),
    ).toBeLessThanOrEqual(new Date(state.currentMahadasha.endsAt).getTime());
  });

  it('за пределами 120-летнего цикла периодов больше нет', () => {
    expect(dashaState(BORN, 0, new Date('2200-01-01T00:00:00Z'))).toBeNull();
  });
});
