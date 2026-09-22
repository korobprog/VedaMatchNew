import { BadRequestException, NotFoundException } from '@nestjs/common';
import { INBOX_PAGE_SIZE, LEGACY_INBOX_LIMIT } from './inbox-page';
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
  readAt?: null | { lt: Date } | { not: null };
  createdAt?: Date | { lt: Date };
  id?: string | { in: string[] } | { lt: string };
  title?: { contains: string; mode?: string };
  body?: { contains: string; mode?: string };
  OR?: InboxWhere[];
  AND?: InboxWhere[];
}

/** Минимальная замена условиям Prisma, достаточная для запросов сервиса. */
function matchesInbox(row: InboxRow, where: InboxWhere): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.readAt === null && row.readAt !== null) return false;
  if (where.readAt && 'not' in where.readAt && row.readAt === null)
    return false;
  if (
    where.readAt &&
    'lt' in where.readAt &&
    (row.readAt === null || row.readAt >= where.readAt.lt)
  )
    return false;
  if (where.createdAt instanceof Date) {
    if (row.createdAt.getTime() !== where.createdAt.getTime()) return false;
  } else if (where.createdAt && row.createdAt >= where.createdAt.lt)
    return false;
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (
    where.id &&
    typeof where.id === 'object' &&
    'in' in where.id &&
    !where.id.in.includes(row.id)
  )
    return false;
  if (
    where.id &&
    typeof where.id === 'object' &&
    'lt' in where.id &&
    !(row.id < where.id.lt)
  )
    return false;
  if (
    where.title &&
    !row.title.toLowerCase().includes(where.title.contains.toLowerCase())
  )
    return false;
  if (
    where.body &&
    !row.body.toLowerCase().includes(where.body.contains.toLowerCase())
  )
    return false;
  if (where.OR && !where.OR.some((clause) => matchesInbox(row, clause)))
    return false;
  if (where.AND && !where.AND.every((clause) => matchesInbox(row, clause)))
    return false;
  return true;
}

/** Порядок выборки Prisma: свежее сверху, совпавшая дата — по `id` вниз. */
function compareInboxFixtures(a: InboxRow, b: InboxRow): number {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
}

function createService() {
  const store = {
    subscriptions: [] as Array<Record<string, unknown>>,
    preference: null as Record<string, unknown> | null,
    inbox: [] as InboxRow[],
    /** Сколько раз лента что-то удаляла: чистка ушла с чтения (VED-267). */
    inboxDeletes: 0,
    /** Сколько раз переписывалась одна запись: повторное нажатие на ту же
     *  сторону кнопки не должно доходить до базы (VED-143). */
    inboxUpdates: 0,
    /** Ответы `pushSubscription.count()` для `deliveryStatus`: живые и
     *  помеченные мёртвыми подписки считаются отдельными запросами. */
    webCount: 0,
    webStale: 0,
    deviceGroups: [] as Array<{
      provider: string;
      _count: { _all: number };
    }>,
    /* Что записали в отметки живости и что удалили: тесты смотрят сюда, а не
       в сами jest-моки — так проверяется результат, а не форма вызова. */
    webWrites: [] as Array<Record<string, unknown>>,
    webDeleted: [] as string[],
    deviceWrites: [] as Array<Record<string, unknown>>,
    deviceDeleted: [] as string[],
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
      findMany: jest.fn(
        ({ where, take }: { where: InboxWhere; take?: number }) =>
          Promise.resolve(
            store.inbox
              .filter((row) => matchesInbox(row, where))
              .sort(compareInboxFixtures)
              .slice(0, take),
          ),
      ),
      findFirst: jest.fn(({ where }: { where: InboxWhere }) =>
        Promise.resolve(
          store.inbox.find((row) => matchesInbox(row, where)) ?? null,
        ),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { readAt: Date | null };
        }) => {
          const row = store.inbox.find((item) => item.id === where.id);
          if (!row) throw new Error(`нет записи ${where.id}`);
          row.readAt = data.readAt;
          store.inboxUpdates += 1;
          return Promise.resolve(row);
        },
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
        store.inboxDeletes += 1;
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
        store.webDeleted.push(where.endpoint);
        return Promise.resolve({ count: 1 });
      }),
      findMany: jest.fn(() => Promise.resolve(store.subscriptions)),
      updateMany: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        store.webWrites.push(data);
        return Promise.resolve({ count: 1 });
      }),
      count: jest.fn(({ where }: { where: { deadSince?: unknown } }) =>
        Promise.resolve(
          where.deadSince === null ? store.webCount : store.webStale,
        ),
      ),
    },
    notificationDevice: {
      deleteMany: jest.fn(({ where }: { where: { token: string } }) => {
        store.deviceDeleted.push(where.token);
        return Promise.resolve({ count: 1 });
      }),
      updateMany: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        store.deviceWrites.push(data);
        return Promise.resolve({ count: 1 });
      }),
      groupBy: jest.fn(() => Promise.resolve(store.deviceGroups)),
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

describe('NotificationsService.deleteOwnSubscription', () => {
  it('удаляет подписку только своего пользователя', async () => {
    const { service, prisma } = createService();
    await service.deleteOwnSubscription('user-1', 'https://push.example/abc');
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example/abc', userId: 'user-1' },
    });
  });

  it('без endpoint отвечает 400', async () => {
    const { service, prisma } = createService();
    await expect(
      service.deleteOwnSubscription('user-1', undefined as never),
    ).rejects.toThrow('endpoint обязателен');
    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.getPreferences', () => {
  it('без строки в базе считает включённым всё', async () => {
    const { service } = createService();

    await expect(service.getPreferences('user-1')).resolves.toEqual({
      enabled: true,
      chat: true,
      calls: true,
      connections: true,
      support: true,
      transits: true,
      market: true,
      notices: true,
      motivation: true,
      music: true,
      travel: true,
      work: true,
      announcements: true,
      telegram: true,
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
      // Патч про переписку звонков не касается (VED-361): они остаются
      // включёнными, даже когда «Сообщения» выключили.
      calls: true,
      connections: true,
      support: true,
      transits: true,
      market: true,
      notices: true,
      motivation: true,
      music: true,
      travel: true,
      work: true,
      announcements: true,
      telegram: true,
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

  it('после отметки прочитанным счётчик обнуляется, а запись остаётся в списке', async () => {
    // Список показывает и прочитанное: раньше открытие страницы гасило всё
    // разом, и уведомления исчезали до того, как человек до них дошёл.
    const { service } = createService();
    await service.addToInbox('user-1', draft);

    await service.markRead('user-1');

    await expect(service.countUnread('user-1')).resolves.toBe(0);
    const inbox = await service.listInbox('user-1');
    expect(inbox.unreadCount).toBe(0);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].readAt).not.toBeNull();
  });

  it('помечает прочитанным только названные уведомления', async () => {
    const { service } = createService();
    await service.addToInbox('user-1', draft);
    await service.addToInbox('user-1', { ...draft, title: 'Второе' });
    const before = await service.listInbox('user-1');

    await service.markRead('user-1', [before.items[0].id]);

    const after = await service.listInbox('user-1');
    expect(after.unreadCount).toBe(1);
    expect(
      after.items.find((item) => item.id === before.items[0].id)?.readAt,
    ).not.toBeNull();
  });

  /**
   * VED-153: прочитанное оседает свежим кверху. Старое уведомление, открытое
   * только что, не должно всплывать над свежим, прочитанным давно.
   */
  it('прочитанное идёт свежим сверху, а не по времени прочтения', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', { ...draft, title: 'Старое' });
    await service.addToInbox('user-1', { ...draft, title: 'Свежее' });
    const day = 24 * 60 * 60 * 1000;
    const [older, newer] = store.inbox;
    older.createdAt = new Date(Date.now() - 3 * day);
    older.readAt = new Date(); // открыли только что
    newer.createdAt = new Date(Date.now() - day);
    newer.readAt = new Date(Date.now() - day + 60_000); // прочитано давно

    const inbox = await service.listInbox('user-1');

    expect(inbox.items.map((item) => item.title)).toEqual(['Свежее', 'Старое']);
  });

  it('непрочитанное стоит выше прочитанного, даже если прочитанное свежее', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', { ...draft, title: 'Старое, но новое' });
    await service.addToInbox('user-1', {
      ...draft,
      title: 'Свежее прочитанное',
    });
    const [unread, read] = store.inbox;
    unread.createdAt = new Date(Date.now() - 60 * 60 * 1000);
    read.readAt = new Date();

    const inbox = await service.listInbox('user-1');

    expect(inbox.items.map((item) => item.title)).toEqual([
      'Старое, но новое',
      'Свежее прочитанное',
    ]);
  });

  /**
   * VED-267. Чистка уехала в `NotificationPurgeWorkerService`: раньше она
   * стояла первой строкой `listInbox()`, и человек ждал удалений, чтобы
   * получить свой список. Сроки хранения проверяет `inbox-retention.spec.ts`,
   * сама чистка — спека воркера; здесь важно, что чтение ленты больше ничего
   * не удаляет.
   */
  it('чтение ленты ничего не удаляет: чистка ушла с горячего пути', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', draft);
    await service.markRead('user-1');
    store.inbox[0].readAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

    await service.listInbox('user-1');

    expect(store.inboxDeletes).toBe(0);
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

/**
 * VED-143: своя отметка у каждого уведомления. Оптом было только «отметить
 * все», а человеку нужно разобрать ленту по одному — и передумать.
 */
describe('NotificationsService.setReadState (VED-143)', () => {
  const draft = {
    title: 'Ямуна ответила',
    body: 'Открыть переписку',
    url: '/chat/1',
    category: 'chat' as const,
  };

  it('гасит одно уведомление и сразу отдаёт счётчик для колокольчика', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', draft);
    await service.addToInbox('user-1', { ...draft, title: 'Мадхава' });

    const result = await service.setReadState(
      'user-1',
      store.inbox[0].id,
      true,
    );

    expect(result.id).toBe(store.inbox[0].id);
    expect(result.readAt).not.toBeNull();
    expect(result.unreadCount).toBe(1);
    expect(store.inbox[1].readAt).toBeNull();
  });

  it('возвращает уведомление в непрочитанные', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', draft);
    const id = store.inbox[0].id;
    await service.setReadState('user-1', id, true);

    const result = await service.setReadState('user-1', id, false);

    expect(result.readAt).toBeNull();
    expect(result.unreadCount).toBe(1);
    await expect(service.countUnread('user-1')).resolves.toBe(1);
  });

  it('повторное нажатие на ту же сторону не двигает дату прочтения', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', draft);
    const id = store.inbox[0].id;
    const first = await service.setReadState('user-1', id, true);
    const updatesAfterFirst = store.inboxUpdates;

    const second = await service.setReadState('user-1', id, true);

    expect(second.readAt).toBe(first.readAt);
    // До базы повторное нажатие не доходит вовсе.
    expect(store.inboxUpdates).toBe(updatesAfterFirst);
  });

  it('чужое уведомление не найдётся', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', draft);

    await expect(
      service.setReadState('user-2', store.inbox[0].id, true),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(store.inbox[0].readAt).toBeNull();
  });

  it('несуществующий id — 404, а не молчаливое «ок»', async () => {
    const { service } = createService();

    await expect(
      service.setReadState('user-1', 'нет-такого', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('возвращённое в непрочитанные снова стоит выше прочитанного', async () => {
    // Порядок VED-153 держится на самом `readAt`, а не на отдельной колонке:
    // откат обязан возвращать запись в первый поток ленты, иначе «вернуть»
    // означало бы только смену вида.
    const { service, store } = createService();
    await service.addToInbox('user-1', { ...draft, title: 'Старое' });
    await service.addToInbox('user-1', { ...draft, title: 'Свежее' });
    store.inbox[0].createdAt = new Date('2026-09-20T10:00:00.000Z');
    store.inbox[1].createdAt = new Date('2026-09-22T10:00:00.000Z');
    await service.setReadState('user-1', store.inbox[1].id, true);

    await service.setReadState('user-1', store.inbox[1].id, false);
    const { items } = await service.listInbox('user-1');

    expect(items.map((row) => row.title)).toEqual(['Свежее', 'Старое']);
  });
});

/**
 * VED-267: лента приходит порциями, и порядок VED-153 при этом не ломается.
 * Лента — два потока подряд: сначала весь `unread`, затем весь `read`.
 */
describe('NotificationsService.listInbox: постранично (VED-267)', () => {
  /** Насев с явными датами: без них все записи легли бы в одну миллисекунду. */
  async function seed(
    service: NotificationsService,
    store: { inbox: InboxRow[] },
    counts: { unread: number; read: number },
  ) {
    const base = Date.parse('2026-09-20T12:00:00.000Z');
    for (let i = 0; i < counts.unread + counts.read; i += 1)
      await service.addToInbox('user-1', {
        ...draft,
        title: i < counts.unread ? `Новое ${i}` : `Старое ${i}`,
      });
    store.inbox.forEach((row, i) => {
      row.createdAt = new Date(base - i * 60_000);
      row.readAt = i < counts.unread ? null : new Date(base + 1000);
    });
  }

  it('отдаёт запрошенное число и курсор, когда лента длиннее', async () => {
    const { service, store } = createService();
    await seed(service, store, { unread: 5, read: 5 });

    const page = await service.listInbox('user-1', { limit: 3 });

    expect(page.items).toHaveLength(3);
    expect(page.items.map((item) => item.title)).toEqual([
      'Новое 0',
      'Новое 1',
      'Новое 2',
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('счётчик непрочитанного считает всё, а не отданную порцию', async () => {
    const { service, store } = createService();
    await seed(service, store, { unread: 5, read: 5 });

    const page = await service.listInbox('user-1', { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.unreadCount).toBe(5);
  });

  it('страницы, сложенные подряд, дают ту же ленту, что и одним куском', async () => {
    const { service, store } = createService();
    await seed(service, store, { unread: 5, read: 7 });
    const whole = await service.listInbox('user-1', { limit: 100 });

    const collected: string[] = [];
    let cursor: string | null | undefined = undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const page: Awaited<ReturnType<typeof service.listInbox>> =
        await service.listInbox('user-1', { limit: 3, cursor });
      collected.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(collected).toEqual(whole.items.map((item) => item.id));
    expect(collected).toHaveLength(12);
  });

  /** Порядок VED-153 переживает постраничность: непрочитанное впереди. */
  it('прочитанное не приходит раньше непрочитанного, даже если оно свежее', async () => {
    const { service, store } = createService();
    await service.addToInbox('user-1', { ...draft, title: 'Старое, но новое' });
    await service.addToInbox('user-1', {
      ...draft,
      title: 'Свежее прочитанное',
    });
    const [unread, read] = store.inbox;
    unread.createdAt = new Date(Date.now() - 60 * 60 * 1000);
    read.readAt = new Date();

    const page = await service.listInbox('user-1', { limit: 1 });

    expect(page.items.map((item) => item.title)).toEqual(['Старое, но новое']);
  });

  it('порция на границе потоков продолжается прочитанным, а не начинает ленту заново', async () => {
    const { service, store } = createService();
    await seed(service, store, { unread: 2, read: 3 });

    const first = await service.listInbox('user-1', { limit: 3 });
    const second = await service.listInbox('user-1', {
      limit: 3,
      cursor: first.nextCursor,
    });

    expect(first.items.map((item) => item.title)).toEqual([
      'Новое 0',
      'Новое 1',
      'Старое 2',
    ]);
    expect(second.items.map((item) => item.title)).toEqual([
      'Старое 3',
      'Старое 4',
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it('на последней странице курсора нет', async () => {
    const { service, store } = createService();
    await seed(service, store, { unread: 2, read: 0 });

    const page = await service.listInbox('user-1', { limit: 5 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  /** Иначе «показать ещё» тихо крутила бы одну и ту же первую порцию. */
  it('испорченный курсор — ошибка запроса, а не молчаливое начало ленты', async () => {
    const { service, store } = createService();
    await seed(service, store, { unread: 2, read: 0 });

    await expect(
      service.listInbox('user-1', { cursor: 'не курсор' }),
    ).rejects.toThrow(BadRequestException);
  });
});

/**
 * VED-267: постраничность не навязывается. Установленное приложение просит
 * ленту без параметров и второй раз не приходит — ему она отдаётся целиком,
 * ровно как до постраничности. Ломается это незаметно, поэтому обе ветки
 * развилки проверяются здесь.
 */
describe('NotificationsService.listInbox: старый клиент (VED-267)', () => {
  /** Кладём строки прямо в хранилище: две сотни `addToInbox` — это две сотни
   *  записей с одинаковой меткой времени и лишняя секунда на прогон. */
  function fill(store: { inbox: InboxRow[] }, count: number, unread = 14) {
    const base = Date.parse('2026-09-20T12:00:00.000Z');
    for (let i = 0; i < count; i += 1)
      store.inbox.push({
        id: `n${String(i).padStart(5, '0')}`,
        userId: 'user-1',
        title: `Уведомление ${i}`,
        body: 'Текст',
        url: '/notifications',
        category: 'chat',
        createdAt: new Date(base - i * 60_000),
        readAt: i < unread ? null : new Date(base + 1000),
      });
  }

  it('без параметров отдаёт всю ленту, как до постраничности', async () => {
    const { service, store } = createService();
    fill(store, 220);

    const inbox = await service.listInbox('user-1');

    expect(inbox.items).toHaveLength(220);
    expect(inbox.unreadCount).toBe(14);
    expect(inbox.truncated).toBeUndefined();
  });

  it('порядок ленты целиком тот же: непрочитанное впереди', async () => {
    const { service, store } = createService();
    fill(store, 220);

    const inbox = await service.listInbox('user-1');

    expect(inbox.items.slice(0, 14).every((item) => item.readAt === null)).toBe(
      true,
    );
    expect(inbox.items[14].readAt).not.toBeNull();
  });

  it('пустые параметры — тот же старый клиент, а не просьба о порции', async () => {
    const { service, store } = createService();
    fill(store, 220);

    const inbox = await service.listInbox('user-1', { cursor: '', limit: '' });

    expect(inbox.items).toHaveLength(220);
  });

  it('просьба о порции разбирается как порция', async () => {
    const { service, store } = createService();
    fill(store, 220);

    const inbox = await service.listInbox('user-1', { limit: 20 });

    expect(inbox.items).toHaveLength(20);
    expect(inbox.nextCursor).toEqual(expect.any(String));
    expect(inbox.truncated).toBeUndefined();
  });

  it('и курсора одного достаточно, чтобы это была порция', async () => {
    const { service, store } = createService();
    fill(store, 220);
    const first = await service.listInbox('user-1', { limit: 20 });

    const second = await service.listInbox('user-1', {
      cursor: first.nextCursor,
    });

    expect(second.items).toHaveLength(INBOX_PAGE_SIZE);
  });

  /**
   * Потолок стоит не ради клиента, а ради сервера: выборка без ограничения у
   * аккаунта с десятью тысячами уведомлений кладёт его всем. Но обрезать
   * молча нельзя — иначе пропажу не от чего отличить.
   */
  it('упёршись в потолок, говорит об этом, а не обрезает молча', async () => {
    const { service, store } = createService();
    fill(store, LEGACY_INBOX_LIMIT + 5);

    const inbox = await service.listInbox('user-1');

    expect(inbox.items).toHaveLength(LEGACY_INBOX_LIMIT);
    expect(inbox.truncated).toBe(true);
    // Продолжение всё-таки возможно: клиент поновее дочитает курсором.
    expect(inbox.nextCursor).toEqual(expect.any(String));
  });

  it('лента в потолок не упёрлась — признака нет', async () => {
    const { service, store } = createService();
    fill(store, LEGACY_INBOX_LIMIT);

    const inbox = await service.listInbox('user-1');

    expect(inbox.items).toHaveLength(LEGACY_INBOX_LIMIT);
    expect(inbox.truncated).toBeUndefined();
    expect(inbox.nextCursor).toBeNull();
  });

  it('поиск без размера порции ищет по всей ленте старого клиента', async () => {
    const { service, store } = createService();
    fill(store, 220);
    store.inbox[219].title = 'Совсем особое уведомление';

    const found = await service.listInbox('user-1', {
      query: 'совсем особое',
    });

    expect(found.items.map((item) => item.title)).toEqual([
      'Совсем особое уведомление',
    ]);
  });
});

describe('NotificationsService.listInbox: поиск (VED-267)', () => {
  async function seedForSearch(service: NotificationsService) {
    await service.addToInbox('user-1', {
      ...draft,
      title: 'VED-160: новый комментарий',
      body: 'Маму Тхакур дас: сделано и выкачено',
    });
    await service.addToInbox('user-1', {
      ...draft,
      title: 'Новое сообщение',
      body: 'Вринда деви даси: Харе Кришна!',
    });
    await service.addToInbox('user-2', {
      ...draft,
      title: 'VED-160: чужое уведомление',
      body: 'Не должно найтись',
    });
  }

  it('ищет по заголовку', async () => {
    const { service } = createService();
    await seedForSearch(service);

    const found = await service.listInbox('user-1', { query: 'ved-160' });

    expect(found.items.map((item) => item.title)).toEqual([
      'VED-160: новый комментарий',
    ]);
  });

  it('ищет по тексту и не смотрит на регистр', async () => {
    const { service } = createService();
    await seedForSearch(service);

    const found = await service.listInbox('user-1', { query: 'ХАРЕ' });

    expect(found.items.map((item) => item.title)).toEqual(['Новое сообщение']);
  });

  it('ищет только в своей ленте', async () => {
    const { service } = createService();
    await seedForSearch(service);

    const found = await service.listInbox('user-2', { query: 'ved-160' });

    expect(found.items.map((item) => item.title)).toEqual([
      'VED-160: чужое уведомление',
    ]);
  });

  it('все слова запроса обязаны найтись', async () => {
    const { service } = createService();
    await seedForSearch(service);

    await expect(
      service.listInbox('user-1', { query: 'ved-160 выкачено' }),
    ).resolves.toEqual(expect.objectContaining({ nextCursor: null }));
    const narrowed = await service.listInbox('user-1', {
      query: 'ved-160 Кришна',
    });
    expect(narrowed.items).toHaveLength(0);
  });

  it('пустой запрос возвращает обычную ленту', async () => {
    const { service } = createService();
    await seedForSearch(service);

    const found = await service.listInbox('user-1', { query: '   ' });

    expect(found.items).toHaveLength(2);
  });

  /** Колокольчик показывает непрочитанное человека, а не размер выдачи. */
  it('счётчик непрочитанного от поиска не зависит', async () => {
    const { service } = createService();
    await seedForSearch(service);

    const found = await service.listInbox('user-1', { query: 'ved-160' });

    expect(found.items).toHaveLength(1);
    expect(found.unreadCount).toBe(2);
  });
});

describe('NotificationsService.recordPushResult (VED-314)', () => {
  const day = 24 * 60 * 60 * 1000;
  const subscription = {
    id: 's1',
    endpoint: 'https://push.example/abc',
    p256dh: 'p',
    auth: 'a',
    createdAt: new Date(Date.now() - 200 * day),
    lastSuccessAt: null,
    failureCount: 0,
    lastSeenAt: null,
    deadSince: null,
  };

  it('успех отмечает приём и снимает пометку «мёртвая»', async () => {
    const { service, store } = createService();

    await service.recordPushResult(subscription, null);

    expect(store.webDeleted).toEqual([]);
    expect(store.webWrites).toHaveLength(1);
    const written = store.webWrites[0];
    expect(written.lastSuccessAt).toBeInstanceOf(Date);
    expect(written.failureCount).toBe(0);
    expect(written.deadSince).toBeNull();
  });

  it('gone — удаляем: спорить со службой доставки не о чем', async () => {
    const { service, store } = createService();

    await service.recordPushResult(subscription, 'gone');

    expect(store.webDeleted).toEqual([subscription.endpoint]);
    expect(store.webWrites).toEqual([]);
  });

  it('первая неудача только копится в счётчике', async () => {
    const { service, store } = createService();

    await service.recordPushResult(subscription, 'transient');

    expect(store.webDeleted).toEqual([]);
    expect(store.webWrites[0].failureCount).toBe(1);
    expect(store.webWrites[0].lastFailureAt).toBeInstanceOf(Date);
    expect(store.webWrites[0].deadSince).toBeUndefined();
  });

  it('молчит месяц и набрала неудачи — помечается, но остаётся', async () => {
    const { service, store } = createService();

    await service.recordPushResult(
      { ...subscription, failureCount: 2 },
      'transient',
    );

    expect(store.webDeleted).toEqual([]);
    expect(store.webWrites[0].failureCount).toBe(3);
    expect(store.webWrites[0].deadSince).toBeInstanceOf(Date);
  });

  it('помеченная дольше отсрочки — удаляется', async () => {
    const { service, store } = createService();

    await service.recordPushResult(
      {
        ...subscription,
        failureCount: 5,
        deadSince: new Date(Date.now() - 30 * day),
      },
      'transient',
    );

    expect(store.webDeleted).toEqual([subscription.endpoint]);
    expect(store.webWrites).toEqual([]);
  });

  it('свежий браузер с неудачами не помечается: подписке всего день', async () => {
    const { service, store } = createService();

    await service.recordPushResult(
      {
        ...subscription,
        createdAt: new Date(Date.now() - day),
        failureCount: 9,
      },
      'transient',
    );

    expect(store.webWrites[0].failureCount).toBe(10);
    expect(store.webWrites[0].deadSince).toBeUndefined();
  });
});

describe('NotificationsService.recordDeviceResult (VED-314)', () => {
  const device = {
    token: 'fcm-token',
    createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
    lastSuccessAt: null,
    failureCount: 0,
    lastSeenAt: null,
    deadSince: null,
  };

  it('успех отмечает приём телефона', async () => {
    const { service, store } = createService();

    await service.recordDeviceResult(device, null);

    expect(store.deviceDeleted).toEqual([]);
    expect(store.deviceWrites[0].lastSuccessAt).toBeInstanceOf(Date);
    expect(store.deviceWrites[0].deadSince).toBeNull();
  });

  it('gone от FCM удаляет токен', async () => {
    const { service, store } = createService();

    await service.recordDeviceResult(device, 'gone');

    expect(store.deviceDeleted).toEqual(['fcm-token']);
    expect(store.deviceWrites).toEqual([]);
  });

  it('«permanent» от Bot API устройство не удаляет, а идёт в счётчик', async () => {
    const { service, store } = createService();

    await service.recordDeviceResult(device, 'permanent');

    expect(store.deviceDeleted).toEqual([]);
    expect(store.deviceWrites[0].failureCount).toBe(1);
  });
});

describe('NotificationsService.deliveryStatus (VED-314)', () => {
  it('ни одной точки — человеку честно «доставлять некуда»', async () => {
    const { service } = createService();

    await expect(service.deliveryStatus('user-1')).resolves.toEqual({
      web: 0,
      app: 0,
      telegram: 0,
      stale: 0,
      reachable: false,
    });
  });

  it('телефон и бот считаются отдельно, помеченные — не в живых', async () => {
    const { service, store } = createService();
    store.webCount = 1;
    store.webStale = 2;
    store.deviceGroups = [
      { provider: 'fcm', _count: { _all: 2 } },
      { provider: 'telegram', _count: { _all: 1 } },
    ];

    await expect(service.deliveryStatus('user-1')).resolves.toEqual({
      web: 1,
      app: 2,
      telegram: 1,
      stale: 2,
      reachable: true,
    });
  });

  it('остались только помеченные мёртвыми — недостижим', async () => {
    const { service, store } = createService();
    store.webStale = 3;

    await expect(service.deliveryStatus('user-1')).resolves.toMatchObject({
      reachable: false,
      stale: 3,
    });
  });
});

describe('NotificationsService.saveSubscription — отметка жизни (VED-314)', () => {
  it('пересохранение подписки браузером снимает пометку и обнуляет неудачи', async () => {
    const { service, store } = createService();

    await service.saveSubscription(
      'user-1',
      {
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'p', auth: 'a' },
      },
      'Chrome',
    );

    const saved = store.subscriptions[0];
    expect(saved.lastSeenAt).toBeInstanceOf(Date);
    expect(saved.failureCount).toBe(0);
    expect(saved.deadSince).toBeNull();
  });
});
