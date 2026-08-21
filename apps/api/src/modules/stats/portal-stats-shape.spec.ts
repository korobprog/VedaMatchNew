import {
  fillDailySeries,
  fillMonthlySeries,
  groupCities,
} from './portal-stats-shape';

describe('fillDailySeries', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('день без регистраций остаётся нулём, а не исчезает', () => {
    const series = fillDailySeries(new Map([['2026-08-21', 3]]), now, 3);

    expect(series).toEqual([
      { period: '2026-08-19', count: 0 },
      { period: '2026-08-20', count: 0 },
      { period: '2026-08-21', count: 3 },
    ]);
  });

  it('идёт по возрастанию и заканчивается сегодняшним днём', () => {
    const series = fillDailySeries(new Map(), now, 30);

    expect(series).toHaveLength(30);
    expect(series[0].period).toBe('2026-07-23');
    expect(series[29].period).toBe('2026-08-21');
  });
});

describe('fillMonthlySeries', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('включает текущий месяц и добивает пропуски нулями', () => {
    const series = fillMonthlySeries(new Map([['2026-08', 5]]), now, 3);

    expect(series).toEqual([
      { period: '2026-06', count: 0 },
      { period: '2026-07', count: 0 },
      { period: '2026-08', count: 5 },
    ]);
  });

  it('переходит через границу года', () => {
    const series = fillMonthlySeries(
      new Map(),
      new Date('2026-02-10T00:00:00.000Z'),
      4,
    );

    expect(series.map((point) => point.period)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });
});

describe('groupCities', () => {
  it('город ниже порога не показывается отдельно', () => {
    const result = groupCities(
      [
        { city: 'Москва', count: 5 },
        { city: 'Вриндаван', count: 1 },
        { city: 'Рига', count: 2 },
      ],
      3,
    );

    expect(result.shown).toEqual([{ city: 'Москва', count: 5 }]);
    expect(result.hiddenPeople).toBe(3);
  });

  it('сортирует по числу людей, при равенстве — по алфавиту', () => {
    const result = groupCities(
      [
        { city: 'Рига', count: 4 },
        { city: 'Алматы', count: 4 },
        { city: 'Москва', count: 9 },
      ],
      3,
    );

    expect(result.shown.map((row) => row.city)).toEqual([
      'Москва',
      'Алматы',
      'Рига',
    ]);
  });

  it('незаполненный город — это не скрытый город, а его отсутствие', () => {
    const result = groupCities(
      [
        { city: null, count: 7 },
        { city: '   ', count: 2 },
        { city: 'Москва', count: 3 },
      ],
      3,
    );

    expect(result.shown).toEqual([{ city: 'Москва', count: 3 }]);
    expect(result.hiddenPeople).toBe(0);
  });
});
