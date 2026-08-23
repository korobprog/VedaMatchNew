import {
  isProfileComplete,
  qualifyReferral,
  type ReferralQualificationInput,
} from './rewards-qualify';

const OPTIONS = { qualifyMinDays: 3, accrualDelayHours: 24 };
const REGISTERED = new Date('2026-08-01T10:00:00.000Z');
const FULL_PROFILE = {
  name: 'Виктор',
  avatarUrl: 'https://cdn/avatar.jpg',
  city: 'Минск',
};

function input(
  patch: Partial<ReferralQualificationInput> = {},
): ReferralQualificationInput {
  return {
    registeredAt: REGISTERED,
    profile: FULL_PROFILE,
    activityAt: new Date('2026-08-02T10:00:00.000Z'),
    ...patch,
  };
}

describe('isProfileComplete', () => {
  it('требует имя, фото и город одновременно', () => {
    expect(isProfileComplete(FULL_PROFILE)).toBe(true);
    expect(isProfileComplete({ ...FULL_PROFILE, city: null })).toBe(false);
    expect(isProfileComplete({ ...FULL_PROFILE, avatarUrl: null })).toBe(false);
    expect(isProfileComplete({ ...FULL_PROFILE, name: null })).toBe(false);
  });

  it('не считает пробелы заполненным полем', () => {
    expect(isProfileComplete({ ...FULL_PROFILE, city: '   ' })).toBe(false);
  });
});

describe('qualifyReferral', () => {
  it('не засчитывает незаполненный профиль', () => {
    const result = qualifyReferral(
      input({ profile: { ...FULL_PROFILE, city: null } }),
      OPTIONS,
      new Date('2026-09-01T00:00:00.000Z'),
    );
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe('profile_incomplete');
  });

  it('не засчитывает регистрацию без единого действия', () => {
    const result = qualifyReferral(
      input({ activityAt: null }),
      OPTIONS,
      new Date('2026-09-01T00:00:00.000Z'),
    );
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe('no_activity');
  });

  // Главное свойство беты: активность в первый же день не ускоряет начисление,
  // иначе бот регистрируется, шлёт сообщение и уходит с баллами.
  it('ждёт положенные дни, даже если действие было сразу', () => {
    const result = qualifyReferral(
      input({ activityAt: new Date('2026-08-01T10:05:00.000Z') }),
      OPTIONS,
      new Date('2026-08-02T00:00:00.000Z'),
    );
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe('too_early');
    expect(result.eligibleAt.toISOString()).toBe('2026-08-05T10:00:00.000Z');
  });

  it('засчитывает, когда профиль заполнен, действие было и дни прошли', () => {
    const result = qualifyReferral(
      input(),
      OPTIONS,
      new Date('2026-08-10T00:00:00.000Z'),
    );
    expect(result.qualified).toBe(true);
    expect(result.reason).toBeNull();
    // Поздний из двух моментов: активность на второй день, зрелость на третий.
    expect(result.qualifiedAt?.toISOString()).toBe('2026-08-04T10:00:00.000Z');
  });

  it('берёт поздний момент, когда действие случилось после зрелости', () => {
    const result = qualifyReferral(
      input({ activityAt: new Date('2026-08-20T08:00:00.000Z') }),
      OPTIONS,
      new Date('2026-08-21T00:00:00.000Z'),
    );
    expect(result.qualifiedAt?.toISOString()).toBe('2026-08-20T08:00:00.000Z');
    expect(result.eligibleAt.toISOString()).toBe('2026-08-21T08:00:00.000Z');
  });

  it('нулевая задержка и нулевой порог не ломают расчёт', () => {
    const result = qualifyReferral(
      input({ activityAt: new Date('2026-08-01T11:00:00.000Z') }),
      { qualifyMinDays: 0, accrualDelayHours: 0 },
      new Date('2026-08-01T12:00:00.000Z'),
    );
    expect(result.qualified).toBe(true);
    expect(result.eligibleAt.toISOString()).toBe('2026-08-01T11:00:00.000Z');
  });

  it('отрицательные настройки читаются как нулевые, а не как сдвиг в прошлое', () => {
    const result = qualifyReferral(
      input({ activityAt: new Date('2026-08-01T11:00:00.000Z') }),
      { qualifyMinDays: -5, accrualDelayHours: -5 },
      new Date('2026-08-01T12:00:00.000Z'),
    );
    expect(result.qualified).toBe(true);
    expect(result.eligibleAt.toISOString()).toBe('2026-08-01T11:00:00.000Z');
  });
});
