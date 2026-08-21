import { buildAudienceWhere, normalizeAudience } from './broadcast-audience';

describe('buildAudienceWhere', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('пустой фильтр — все живые аккаунты и никаких других условий', () => {
    expect(buildAudienceWhere({}, now)).toEqual({
      accountStatus: 'active',
      deletedAt: null,
    });
  });

  it('заблокированных и удалённых не берёт даже при заданных фильтрах', () => {
    const where = buildAudienceWhere({ stages: ['devotee'] }, now);

    expect(where.accountStatus).toBe('active');
    expect(where.deletedAt).toBeNull();
  });

  it('фильтрует по этапам', () => {
    expect(
      buildAudienceWhere({ stages: ['seeker', 'yogi'] }, now),
    ).toMatchObject({ spiritualStage: { in: ['seeker', 'yogi'] } });
  });

  it('переводит роль во внутреннее написание с подчёркиванием', () => {
    expect(
      buildAudienceWhere({ roles: ['service-admin', 'user'] }, now),
    ).toMatchObject({ role: { in: ['service_admin', 'user'] } });
  });

  it('«платят» — платный доступ, не истёкший на текущий момент', () => {
    expect(buildAudienceWhere({ payment: 'paid' }, now)).toMatchObject({
      subscriptionPaidUntil: { gt: now },
    });
  });

  it('«не платят» — доступа нет вовсе или он уже кончился', () => {
    expect(buildAudienceWhere({ payment: 'unpaid' }, now)).toMatchObject({
      OR: [
        { subscriptionPaidUntil: null },
        { subscriptionPaidUntil: { lte: now } },
      ],
    });
  });

  it('«только с пушем» требует хотя бы одну подписку', () => {
    expect(buildAudienceWhere({ withPushOnly: true }, now)).toMatchObject({
      pushSubscriptions: { some: {} },
    });
  });

  it('складывает условия вместе', () => {
    const where = buildAudienceWhere(
      { stages: ['devotee'], payment: 'paid', withPushOnly: true },
      now,
    );

    expect(where).toMatchObject({
      accountStatus: 'active',
      spiritualStage: { in: ['devotee'] },
      subscriptionPaidUntil: { gt: now },
      pushSubscriptions: { some: {} },
    });
  });
});

describe('normalizeAudience', () => {
  it('пустые массивы значат то же, что их отсутствие', () => {
    expect(normalizeAudience({ stages: [], roles: [] })).toEqual({});
    expect(normalizeAudience(undefined)).toEqual({});
  });

  it('оставляет только заданные условия', () => {
    expect(
      normalizeAudience({ stages: ['yogi'], withPushOnly: false }),
    ).toEqual({ stages: ['yogi'] });
  });

  it('отбрасывает неизвестное значение оплаты', () => {
    expect(normalizeAudience({ payment: 'trial' as never })).toEqual({});
  });

  it('сохраняет разобранный фильтр целиком', () => {
    const filter = {
      stages: ['seeker' as const],
      roles: ['user' as const],
      payment: 'unpaid' as const,
      withPushOnly: true,
    };

    expect(normalizeAudience(filter)).toEqual(filter);
  });
});
