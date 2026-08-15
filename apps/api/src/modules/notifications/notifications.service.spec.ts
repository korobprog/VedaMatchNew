import { NotificationsService } from './notifications.service';
import type { PrismaService } from '../../prisma/prisma.service';

interface InboxRow {
  id: string;
  userId: string;
  title: string;
  body: string;
  url: string;
  category: string;
  createdAt: Date;
  readAt: Date | null;
}

type InboxDraftRow = Omit<InboxRow, 'id' | 'createdAt' | 'readAt'>;

interface InboxWhere {
  userId?: string;
  readAt?: null | { lt: Date };
  createdAt?: { lt: Date };
  id?: { in: string[] };
  OR?: InboxWhere[];
}

/** Минимальная замена условиям Prisma, достаточная для запросов сервиса. */
function matchesInbox(row: InboxRow, where: InboxWhere): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.readAt === null && row.readAt !== null) return false;
  if (where.readAt && (row.readAt === null || row.readAt >= where.readAt.lt))
    return false;
  if (where.createdAt && row.createdAt >= where.createdAt.lt) return false;
  if (where.id && !where.id.in.includes(row.id)) return false;
  if (where.OR && !where.OR.some((clause) => matchesInbox(row, clause)))
    return false;
  return true;
}

function createService() {
  const store = {
    subscriptions: [] as Array<Record<string, unknown>>,
    preference: null as Record<string, unknown> | null,
    inbox: [] as InboxRow[],
  };
  let nextId = 1;
  const prisma = {
    notificationItem: {
      create: jest.fn(({ data }: { data: InboxDraftRow }) => {
        const row: InboxRow = {
          id: `n${nextId++}`,
          createdAt: new Date(),
          readAt: null,
          ...data,
        };
        store.inbox.push(row);
        return Promise.resolve(row);
      }),
      count: jest.fn(({ where }: { where: InboxWhere }) =>
        Promise.resolve(
          store.inbox.filter((row) => matchesInbox(row, where)).length,
        ),
      ),
      findMany: jest.fn(({ where }: { where: InboxWhere }) =>
        Promise.resolve(
          store.inbox
            .filter((row) => matchesInbox(row, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        ),
      ),
      updateMany: jest.fn(
        ({ where, data }: { where: InboxWhere; data: { readAt: Date } }) => {
          let count = 0;
          for (const row of store.inbox) {
            if (!matchesInbox(row, where)) continue;
            row.readAt = data.readAt;
            count += 1;
          }
          return Promise.resolve({ count });
        },
      ),
      deleteMany: jest.fn(({ where }: { where: InboxWhere }) => {
        const before = store.inbox.length;
        store.inbox = store.inbox.filter((row) => !matchesInbox(row, where));
        return Promise.resolve({ count: before - store.inbox.length });
      }),
    },
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
      market: true,
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
      market: true,
    });
  });
});

const draft = {
  title: 'Вринда',
  body: 'Харе Кришна',
  url: '/union/chats/r1',
  category: 'chat' as const,
};

describe('NotificationsService: колокольчик', () => {
  it('показывает добавленное как непрочитанное', async () => {
    const { service } = createService();

    await service.addToInbox('user-1', draft);

    await expect(service.countUnread('user-1')).resolves.toBe(1);
    const inbox = await service.listInbox('user-1');
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.items[0]).toEqual(
      expect.objectContaining({ title: 'Вринда', category: 'chat' }),
    );
  });

  it('не показывает чужие уведомления', async () => {
    const { service } = createService();

    await service.addToInbox('user-2', draft);

    await expect(service.countUnread('user-1')).resolves.toBe(0);
  });

  it('после отметки прочитанным счётчик обнуляется, а список пустеет', async () => {
    const { service } = createService();
    await service.addToInbox('user-1', draft);

    await service.markRead('user-1');

    await expect(service.countUnread('user-1')).resolves.toBe(0);
    await expect(service.listInbox('user-1')).resolves.toEqual({
      items: [],
      unreadCount: 0,
    });
  });

  it('удаляет прочитанное, пролежавшее дольше отсрочки: архив не копится', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', draft);
    await service.markRead('user-1');
    // Отсрочка (15 минут) прошла — строке больше незачем занимать место.
    store.inbox[0].readAt = new Date(Date.now() - 60 * 60 * 1000);

    await service.listInbox('user-1');

    expect(store.inbox).toHaveLength(0);
  });

  it('сохраняет только что прочитанное: перезагрузка страницы не теряет список', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', draft);
    await service.markRead('user-1');

    await service.listInbox('user-1');

    expect(store.inbox).toHaveLength(1);
  });

  it('помечает прочитанным только указанные уведомления', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', draft);
    await service.addToInbox('user-1', { ...draft, title: 'Мадхава' });

    await service.markRead('user-1', [store.inbox[0].id]);

    await expect(service.countUnread('user-1')).resolves.toBe(1);
  });
});
