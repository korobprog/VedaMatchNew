import {
  extendPaidUntil,
  toSubscriptionState,
  trialEndsAt,
  TRIAL_DAYS,
} from './subscription';

const NOW = new Date('2026-07-28T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function source(
  overrides: Partial<Parameters<typeof toSubscriptionState>[0]> = {},
) {
  return {
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    trialEndsAt: null,
    subscriptionPaidUntil: null,
    subscriptionNote: null,
    ...overrides,
  };
}

describe('trialEndsAt', () => {
  it('считает 30 дней от регистрации, если поле не заполнено', () => {
    const user = source();
    expect(trialEndsAt(user).getTime()).toBe(
      user.createdAt.getTime() + TRIAL_DAYS * DAY_MS,
    );
  });

  it('уважает явную дату окончания триала', () => {
    const explicit = new Date('2026-08-15T00:00:00.000Z');
    expect(trialEndsAt(source({ trialEndsAt: explicit }))).toEqual(explicit);
  });
});

describe('toSubscriptionState', () => {
  it('пробный период активен, пока не истёк', () => {
    const state = toSubscriptionState(source(), NOW);
    expect(state.status).toBe('trial');
    expect(state.daysLeft).toBe(3);
    expect(state.paidUntil).toBeNull();
  });

  it('оплата важнее триала', () => {
    const state = toSubscriptionState(
      source({ subscriptionPaidUntil: new Date('2026-09-01T00:00:00.000Z') }),
      NOW,
    );
    expect(state.status).toBe('active');
    expect(state.accessUntil).toBe('2026-09-01T00:00:00.000Z');
  });

  it('после истечения обоих периодов доступ закрыт', () => {
    const state = toSubscriptionState(
      source({
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        subscriptionPaidUntil: new Date('2026-06-01T00:00:00.000Z'),
      }),
      NOW,
    );
    expect(state.status).toBe('expired');
    expect(state.accessUntil).toBeNull();
    expect(state.daysLeft).toBe(0);
  });
});

describe('extendPaidUntil', () => {
  it('продлевает от текущего конца, если он в будущем', () => {
    const current = new Date('2026-09-10T00:00:00.000Z');
    expect(extendPaidUntil(current, 1, NOW).toISOString()).toBe(
      '2026-10-10T00:00:00.000Z',
    );
  });

  it('продлевает от сегодня, если оплата уже истекла', () => {
    const current = new Date('2026-05-10T00:00:00.000Z');
    expect(extendPaidUntil(current, 1, NOW).toISOString()).toBe(
      '2026-08-28T12:00:00.000Z',
    );
  });
});
