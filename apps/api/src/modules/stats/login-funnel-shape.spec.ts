import {
  buildAdminLoginStats,
  shapeLoginCounters,
  shapeLoginReturns,
} from './login-funnel-shape';

describe('shapeLoginCounters', () => {
  it('заполняет нулём источники без входов за период, порядок фиксирован', () => {
    const result = shapeLoginCounters([
      { client: 'site', logins: 10n, users: 7n },
      { client: 'telegram', logins: 3, users: 2 },
    ]);

    expect(result).toEqual([
      { client: 'site', logins: 10, users: 7 },
      { client: 'web-app', logins: 0, users: 0 },
      { client: 'telegram', logins: 3, users: 2 },
      { client: 'android', logins: 0, users: 0 },
    ]);
  });

  it('отбрасывает строки с незнакомым или пустым client (записи до миграции)', () => {
    const result = shapeLoginCounters([
      { client: null, logins: 5, users: 5 },
      { client: 'dev-password', logins: 1, users: 1 },
      { client: 'site', logins: 2, users: 2 },
    ]);

    expect(result.find((row) => row.client === 'site')).toEqual({
      client: 'site',
      logins: 2,
      users: 2,
    });
    const total = result.reduce((sum, row) => sum + row.logins, 0);
    expect(total).toBe(2);
  });
});

describe('shapeLoginReturns', () => {
  it('считает долю возврата как cohortSize/returnedCount', () => {
    const result = shapeLoginReturns([
      { client: 'telegram', cohortSize: 20, returnedCount: 5 },
    ]);

    expect(result.find((row) => row.client === 'telegram')).toEqual({
      client: 'telegram',
      cohortSize: 20,
      returnedCount: 5,
      returnRate: 0.25,
    });
  });

  it('возвращает null вместо деления на ноль, когда когорта пуста', () => {
    const result = shapeLoginReturns([]);

    for (const row of result) {
      expect(row.cohortSize).toBe(0);
      expect(row.returnedCount).toBe(0);
      expect(row.returnRate).toBeNull();
    }
  });
});

describe('buildAdminLoginStats', () => {
  it('собирает три раздела воронки из сырых строк', () => {
    const stats = buildAdminLoginStats({
      last7Days: [{ client: 'site', logins: 1, users: 1 }],
      last30Days: [{ client: 'android', logins: 4, users: 3 }],
      return7Day: [{ client: 'web-app', cohortSize: 2, returnedCount: 1 }],
    });

    expect(stats.last7Days.find((r) => r.client === 'site')?.logins).toBe(1);
    expect(stats.last30Days.find((r) => r.client === 'android')?.users).toBe(3);
    expect(
      stats.return7Day.find((r) => r.client === 'web-app')?.returnRate,
    ).toBe(0.5);
  });
});
