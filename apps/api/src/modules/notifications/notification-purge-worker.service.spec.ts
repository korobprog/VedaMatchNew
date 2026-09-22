import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationPurgeWorkerService } from './notification-purge-worker.service';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-22T12:00:00.000Z');

interface Row {
  id: string;
  createdAt: Date;
  readAt: Date | null;
}

interface Where {
  OR?: Array<{ readAt?: { lt: Date }; createdAt?: { lt: Date } }>;
  id?: { in: string[] };
}

/** Столько же, сколько у воркера: пакет и его предел проверяются вместе. */
const BATCH_SIZE = 500;

function createWorker(rows: Row[]) {
  const store = { rows: [...rows], deleteCalls: 0 };
  const matches = (row: Row, where: Where): boolean => {
    if (where.id) return where.id.in.includes(row.id);
    if (!where.OR) return true;
    return where.OR.some(
      (clause) =>
        (clause.readAt !== undefined &&
          row.readAt !== null &&
          row.readAt < clause.readAt.lt) ||
        (clause.createdAt !== undefined && row.createdAt < clause.createdAt.lt),
    );
  };
  const prisma = {
    notificationItem: {
      findMany: jest.fn(({ where, take }: { where: Where; take?: number }) =>
        Promise.resolve(
          store.rows
            .filter((row) => matches(row, where))
            .slice(0, take)
            .map((row) => ({ id: row.id })),
        ),
      ),
      deleteMany: jest.fn(({ where }: { where: Where }) => {
        store.deleteCalls += 1;
        const before = store.rows.length;
        store.rows = store.rows.filter((row) => !matches(row, where));
        return Promise.resolve({ count: before - store.rows.length });
      }),
    },
  } as unknown as PrismaService;
  // Без REDIS_HOST воркер работает без лиза — так же, как локальная разработка.
  const config = { get: () => undefined } as unknown as ConfigService;
  return {
    worker: new NotificationPurgeWorkerService(prisma, config),
    store,
    prisma,
  };
}

const row = (id: string, createdAgo: number, readAgo: number | null): Row => ({
  id,
  createdAt: new Date(now.getTime() - createdAgo),
  readAt: readAgo === null ? null : new Date(now.getTime() - readAgo),
});

describe('NotificationPurgeWorkerService (VED-267)', () => {
  it('удаляет просроченное и оставляет живое', async () => {
    const { worker, store } = createWorker([
      row('свежее непрочитанное', 2 * DAY, null),
      row('только что прочитанное', 2 * DAY, 60_000),
      row('прочитанное давно', 20 * DAY, 8 * DAY),
      row('непрочитанное с прошлого месяца', 40 * DAY, null),
    ]);

    const removed = await worker.purge(now);

    expect(removed).toBe(2);
    expect(store.rows.map((item) => item.id)).toEqual([
      'свежее непрочитанное',
      'только что прочитанное',
    ]);
  });

  it('на чистой ленте ничего не удаляет и обходится одним запросом', async () => {
    const { worker, store, prisma } = createWorker([
      row('свежее', 1 * DAY, null),
    ]);

    await expect(worker.purge(now)).resolves.toBe(0);

    expect(store.deleteCalls).toBe(0);
    expect(prisma.notificationItem.findMany).toHaveBeenCalledTimes(1);
  });

  /**
   * Если чистка не работала неделю, первый заход не должен превратиться в
   * один `DELETE` на всю таблицу.
   */
  it('разбирает накопившееся пакетами, а не одним запросом', async () => {
    const stale = Array.from({ length: BATCH_SIZE + 7 }, (_, index) =>
      row(`старое-${index}`, 40 * DAY, null),
    );
    const { worker, store } = createWorker(stale);

    const removed = await worker.purge(now);

    expect(removed).toBe(BATCH_SIZE + 7);
    expect(store.deleteCalls).toBe(2);
    expect(store.rows).toHaveLength(0);
  });

  it('упавший запрос роняет тик, но не процесс: следующий попробует снова', async () => {
    const { worker, prisma } = createWorker([]);
    jest
      .spyOn(prisma.notificationItem, 'findMany')
      .mockRejectedValueOnce(new Error('база прилегла'));

    await expect(worker.tick(now)).resolves.toBeUndefined();
  });
});
