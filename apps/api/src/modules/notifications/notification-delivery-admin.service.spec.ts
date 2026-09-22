import type { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationDeliveryAdminService,
  normalizeWindowDays,
} from './notification-delivery-admin.service';
import { DELIVERY_SILENCE_MS } from './delivery-health';

const day = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

const health = {
  createdAt: ago(200 * day),
  lastSuccessAt: ago(day),
  lastFailureAt: null,
  failureCount: 0,
  lastSeenAt: null,
  deadSince: null,
};

function setup(options: {
  web?: Array<Record<string, unknown>>;
  devices?: Array<Record<string, unknown>>;
  items?: Array<{
    userId: string;
    _count: { _all: number };
    _max: { createdAt: Date };
  }>;
  preferences?: Array<{ userId: string; enabled: boolean }>;
}) {
  const prisma = {
    pushSubscription: {
      findMany: jest.fn(() => Promise.resolve(options.web ?? [])),
    },
    notificationDevice: {
      findMany: jest.fn(() => Promise.resolve(options.devices ?? [])),
    },
    notificationItem: {
      groupBy: jest.fn(() => Promise.resolve(options.items ?? [])),
    },
    notificationPreference: {
      findMany: jest.fn(() => Promise.resolve(options.preferences ?? [])),
    },
    user: {
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in.map((id) => ({
            id,
            name: `Имя ${id}`,
            email: `${id}@example.com`,
          })),
        ),
      ),
    },
  } as unknown as PrismaService;
  return {
    service: new NotificationDeliveryAdminService(prisma),
    prisma,
  };
}

describe('NotificationDeliveryAdminService.health', () => {
  it('человек с живой подпиской в недостижимые не попадает', async () => {
    const { service } = setup({
      web: [{ id: 's1', userId: 'u1', userAgent: null, ...health }],
      items: [
        { userId: 'u1', _count: { _all: 9 }, _max: { createdAt: ago(day) } },
      ],
    });

    const report = await service.health();

    expect(report.unreachable).toEqual([]);
    expect(report.summary.usersReachable).toBe(1);
    expect(report.summary.usersUnreachable).toBe(0);
    expect(report.people).toHaveLength(1);
  });

  it('уведомления шли, а точек доставки нет — человек в списке недостижимых', async () => {
    const { service } = setup({
      items: [
        {
          userId: 'u-quiet',
          _count: { _all: 9 },
          _max: { createdAt: ago(day) },
        },
      ],
    });

    const report = await service.health();

    expect(report.unreachable).toHaveLength(1);
    const person = report.unreachable[0];
    expect(person).toMatchObject({
      userId: 'u-quiet',
      name: 'Имя u-quiet',
      email: 'u-quiet@example.com',
      missed: 9,
      // Строки настроек нет — значит включено всё, как в getPreferences().
      notificationsEnabled: true,
      hasDeadPoints: false,
    });
    expect(typeof person.lastNotificationAt).toBe('string');
    expect(report.summary.usersUnreachable).toBe(1);
  });

  it('все точки помечены мёртвыми — недостижим, и это видно отдельно', async () => {
    const { service } = setup({
      web: [
        {
          id: 's1',
          userId: 'u1',
          userAgent: null,
          ...health,
          deadSince: ago(day),
        },
      ],
      items: [
        { userId: 'u1', _count: { _all: 3 }, _max: { createdAt: ago(day) } },
      ],
    });

    const report = await service.health();

    expect(report.unreachable[0]).toMatchObject({
      userId: 'u1',
      hasDeadPoints: true,
    });
    expect(report.summary.usersReachable).toBe(0);
  });

  it('выключенные уведомления помечены: человек молчания и просил', async () => {
    const { service } = setup({
      items: [
        { userId: 'u1', _count: { _all: 2 }, _max: { createdAt: ago(day) } },
      ],
      preferences: [{ userId: 'u1', enabled: false }],
    });

    const report = await service.health();

    expect(report.unreachable[0].notificationsEnabled).toBe(false);
  });

  it('список людей начинается с тех, у кого точки молчат', async () => {
    const { service } = setup({
      web: [
        { id: 's1', userId: 'u-alive', userAgent: null, ...health },
        {
          id: 's2',
          userId: 'u-silent',
          userAgent: null,
          ...health,
          lastSuccessAt: ago(DELIVERY_SILENCE_MS + day),
        },
      ],
    });

    const report = await service.health();

    expect(report.people.map((person) => person.userId)).toEqual([
      'u-silent',
      'u-alive',
    ]);
  });

  it('срок из запроса ограничен, мусор заменяется значением по умолчанию', async () => {
    const { service } = setup({});

    await expect(service.health(1000)).resolves.toMatchObject({
      windowDays: 90,
    });
    await expect(service.health(Number.NaN)).resolves.toMatchObject({
      windowDays: 14,
    });
    await expect(service.health(7)).resolves.toMatchObject({ windowDays: 7 });
  });
});

describe('normalizeWindowDays', () => {
  it('без значения — две недели', () => {
    expect(normalizeWindowDays()).toBe(14);
  });

  it('меньше суток не бывает', () => {
    expect(normalizeWindowDays(0)).toBe(14);
    expect(normalizeWindowDays(-5)).toBe(1);
  });

  it('дробное усекается', () => {
    expect(normalizeWindowDays(3.9)).toBe(3);
  });
});
