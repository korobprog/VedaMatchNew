import { NotificationsService } from './notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';

function createService() {
  const store = {
    subscriptions: [] as Array<Record<string, unknown>>,
    preference: null as Record<string, unknown> | null,
  };
  const prisma = {
    pushSubscription: {
      upsert: jest.fn(
        ({
          create,
        }: {
          where: { endpoint: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          store.subscriptions.push(create);
          return Promise.resolve(create);
        },
      ),
      deleteMany: jest.fn(({ where }: { where: { endpoint: string } }) => {
        store.subscriptions = store.subscriptions.filter(
          (row) => row.endpoint !== where.endpoint,
        );
        return Promise.resolve({ count: 1 });
      }),
      findMany: jest.fn(() => Promise.resolve(store.subscriptions)),
    },
    notificationPreference: {
      findUnique: jest.fn(() => Promise.resolve(store.preference)),
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
        store.preference = { ...create };
        return Promise.resolve(store.preference);
      }),
    },
  } as unknown as PrismaService;

  return { service: new NotificationsService(prisma), prisma, store };
}

describe('NotificationsService.saveSubscription', () => {
  it('сохраняет подписку по endpoint и переносит её на текущего пользователя', async () => {
    const { service, prisma } = createService();

    await service.saveSubscription(
      'user-1',
      {
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'p', auth: 'a' },
      },
      'Chrome',
    );

    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: 'https://push.example/abc' },
        update: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });
});

describe('NotificationsService.getPreferences', () => {
  it('без строки в базе считает включённым всё', async () => {
    const { service } = createService();

    await expect(service.getPreferences('user-1')).resolves.toEqual({
      enabled: true,
      chat: true,
      connections: true,
      support: true,
      transits: true,
    });
  });

  it('возвращает сохранённые настройки', async () => {
    const { service, store } = createService();
    store.preference = {
      enabled: true,
      chat: false,
      connections: true,
      support: false,
      transits: false,
    };

    await expect(service.getPreferences('user-1')).resolves.toEqual({
      enabled: true,
      chat: false,
      connections: true,
      support: false,
      transits: false,
    });
  });
});

describe('NotificationsService.updatePreferences', () => {
  it('дополняет частичный патч значениями по умолчанию', async () => {
    const { service } = createService();

    await expect(
      service.updatePreferences('user-1', { chat: false }),
    ).resolves.toEqual({
      enabled: true,
      chat: false,
      connections: true,
      support: true,
      transits: true,
    });
  });
});
