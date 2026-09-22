import { DELIVERY_SILENCE_MS } from './delivery-health';
import {
  buildDeliveryPoints,
  compareDeliveryUsers,
  type AppDeviceRow,
  type WebSubscriptionRow,
} from './delivery-report';

const now = new Date('2026-09-22T12:00:00.000Z');
const day = 24 * 60 * 60 * 1000;

function ago(ms: number): Date {
  return new Date(now.getTime() - ms);
}

function web(patch: Partial<WebSubscriptionRow> = {}): WebSubscriptionRow {
  return {
    id: 's1',
    userId: 'u1',
    userAgent:
      'Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile Safari/537.36',
    createdAt: ago(60 * day),
    lastSuccessAt: ago(day),
    lastFailureAt: null,
    failureCount: 0,
    lastSeenAt: null,
    deadSince: null,
    ...patch,
  };
}

function device(patch: Partial<AppDeviceRow> = {}): AppDeviceRow {
  return {
    id: 'd1',
    userId: 'u1',
    provider: 'fcm',
    platform: 'android',
    appVariant: 'ru-site',
    createdAt: ago(60 * day),
    lastSuccessAt: ago(day),
    lastFailureAt: null,
    failureCount: 0,
    lastSeenAt: null,
    deadSince: null,
    ...patch,
  };
}

describe('buildDeliveryPoints', () => {
  it('считает веб-подписки по состояниям и подписывает браузер', () => {
    const digest = buildDeliveryPoints(
      {
        web: [
          web({ id: 'a' }),
          web({ id: 'b', lastSuccessAt: ago(DELIVERY_SILENCE_MS + day) }),
          web({ id: 'c', deadSince: ago(day) }),
        ],
        devices: [],
      },
      now,
    );

    expect(digest.summary).toMatchObject({
      webTotal: 3,
      webSilent: 1,
      webDead: 1,
    });
    expect(digest.byUser.get('u1')?.map((point) => point.state)).toEqual([
      'alive',
      'silent',
      'dead',
    ]);
    expect(digest.byUser.get('u1')?.[0].label).toBe('Chrome, Android');
  });

  it('телефон и бот разведены: бот в счёт приложения не идёт', () => {
    const digest = buildDeliveryPoints(
      {
        web: [],
        devices: [
          device({ id: 'phone' }),
          device({ id: 'bot', provider: 'telegram', platform: 'telegram' }),
        ],
      },
      now,
    );

    expect(digest.summary).toMatchObject({
      appTotal: 1,
      telegramTotal: 1,
    });
    const kinds = digest.byUser.get('u1')?.map((point) => point.kind);
    expect(kinds).toEqual(['app', 'telegram']);
    expect(digest.byUser.get('u1')?.[1].label).toBe('@vedamatch_bot');
  });

  it('живая точка делает человека достижимым, помеченная — нет', () => {
    const digest = buildDeliveryPoints(
      {
        web: [
          web({ id: 'a', userId: 'alive-user' }),
          web({ id: 'b', userId: 'dead-user', deadSince: ago(day) }),
          web({
            id: 'c',
            userId: 'mixed-user',
            deadSince: ago(day),
          }),
          web({ id: 'd', userId: 'mixed-user' }),
        ],
        devices: [],
      },
      now,
    );

    expect([...digest.reachableUserIds].sort()).toEqual([
      'alive-user',
      'mixed-user',
    ]);
    expect([...digest.deadOnlyUserIds]).toEqual(['dead-user']);
  });

  it('молчащая точка достижимости не отменяет: доставлять всё ещё есть куда', () => {
    const digest = buildDeliveryPoints(
      {
        web: [web({ lastSuccessAt: ago(DELIVERY_SILENCE_MS + day) })],
        devices: [],
      },
      now,
    );

    expect(digest.reachableUserIds.has('u1')).toBe(true);
    expect(digest.deadOnlyUserIds.size).toBe(0);
  });
});

describe('compareDeliveryUsers', () => {
  const point = (
    state: 'alive' | 'silent' | 'dead',
    lastSuccessAt: string | null,
  ) =>
    ({
      state,
      lastSuccessAt,
    }) as Parameters<typeof compareDeliveryUsers>[0]['points'][number];

  it('помеченные мёртвыми — выше молчащих, молчащие — выше живых', () => {
    const people = [
      { points: [point('alive', now.toISOString())] },
      { points: [point('dead', now.toISOString())] },
      { points: [point('silent', now.toISOString())] },
    ];

    expect(
      people.sort(compareDeliveryUsers).map((person) => person.points[0].state),
    ).toEqual(['dead', 'silent', 'alive']);
  });

  it('внутри состояния первым идёт тот, кто дольше не принимал', () => {
    const older = { points: [point('silent', '2026-01-01T00:00:00.000Z')] };
    const newer = { points: [point('silent', '2026-09-01T00:00:00.000Z')] };
    const never = { points: [point('silent', null)] };

    expect([newer, older, never].sort(compareDeliveryUsers)).toEqual([
      never,
      older,
      newer,
    ]);
  });
});
