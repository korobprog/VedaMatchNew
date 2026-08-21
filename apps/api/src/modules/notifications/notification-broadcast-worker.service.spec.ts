import { NotificationBroadcastWorkerService } from './notification-broadcast-worker.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from './notifications.service';
import type { PushSenderService } from './push-sender.service';

type Prefs = { enabled: boolean; announcements: boolean } | null;

interface Recipient {
  id: string;
  notificationPreference: Prefs;
}

const broadcastRow = {
  id: 'b-1',
  title: 'Плановые работы',
  body: 'Портал будет недоступен час',
  url: null,
  important: false,
  audience: {},
  status: 'sending',
  cursorUserId: null,
  totalRecipients: 3,
  deliveredCount: 0,
  attemptCount: 0,
};

/**
 * Воркер собирается с подменёнными зависимостями: Redis не поднимается
 * (REDIS_HOST пуст), а `sendBatch` вызывается напрямую — тик и лиз здесь не
 * проверяются, проверяются правила доставки.
 */
function createWorker(options: {
  broadcast?: Record<string, unknown>;
  recipients?: Recipient[];
  subscriptions?: Array<Record<string, unknown>>;
}) {
  const recipients = options.recipients ?? [];
  const prisma = {
    notificationBroadcast: {
      findUnique: jest.fn(() =>
        Promise.resolve({ ...broadcastRow, ...options.broadcast }),
      ),
      update: jest.fn(() => Promise.resolve({})),
    },
    user: { findMany: jest.fn(() => Promise.resolve(recipients)) },
    pushSubscription: {
      findMany: jest.fn(() => Promise.resolve(options.subscriptions ?? [])),
    },
  };
  const notifications = {
    addManyToInbox: jest.fn(() => Promise.resolve()),
    deleteSubscription: jest.fn(() => Promise.resolve()),
  };
  const sender = { send: jest.fn(() => Promise.resolve(null)) };
  const worker = new NotificationBroadcastWorkerService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    sender as unknown as PushSenderService,
    { get: () => undefined } as never,
  );
  return { worker, prisma, notifications, sender };
}

/** sendBatch приватный: он и есть единица работы, ради которой стоит тест. */
function sendBatch(worker: NotificationBroadcastWorkerService) {
  return (
    worker as unknown as { sendBatch(id: string): Promise<boolean> }
  ).sendBatch('b-1');
}

/** expect.objectContaining типизирован как `any`; оборачиваем в одном месте,
 *  чтобы не глушить правило на каждой проверке. */
const containing = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape);

const allowed: Recipient = {
  id: 'u-1',
  notificationPreference: { enabled: true, announcements: true },
};
const noPrefsRow: Recipient = { id: 'u-2', notificationPreference: null };
const optedOut: Recipient = {
  id: 'u-3',
  notificationPreference: { enabled: true, announcements: false },
};
const allOff: Recipient = {
  id: 'u-4',
  notificationPreference: { enabled: false, announcements: true },
};

describe('NotificationBroadcastWorkerService.sendBatch', () => {
  it('обычная рассылка минует тех, кто выключил категорию', async () => {
    const { worker, notifications } = createWorker({
      recipients: [allowed, noPrefsRow, optedOut, allOff],
    });

    await sendBatch(worker);

    expect(notifications.addManyToInbox).toHaveBeenCalledWith(
      ['u-1', 'u-2'],
      expect.objectContaining({ category: 'announcements' }),
    );
  });

  it('важная рассылка кладётся в колокольчик всем', async () => {
    const { worker, notifications } = createWorker({
      broadcast: { important: true },
      recipients: [allowed, optedOut, allOff],
    });

    await sendBatch(worker);

    expect(notifications.addManyToInbox).toHaveBeenCalledWith(
      ['u-1', 'u-3', 'u-4'],
      expect.anything(),
    );
  });

  it('пуш даже у важной рассылки уходит только разрешившим', async () => {
    const { worker, prisma } = createWorker({
      broadcast: { important: true },
      recipients: [allowed, optedOut, allOff],
    });

    await sendBatch(worker);

    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ['u-1'] } } }),
    );
  });

  it('двигает курсор на последнего в пакете и считает доставку', async () => {
    const { worker, prisma } = createWorker({
      recipients: [allowed, noPrefsRow, optedOut],
      subscriptions: [{ id: 's-1', endpoint: 'e-1', p256dh: 'p', auth: 'a' }],
    });

    const done = await sendBatch(worker);

    expect(done).toBe(false);
    expect(prisma.notificationBroadcast.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: {
        cursorUserId: 'u-3',
        deliveredCount: { increment: 2 },
        pushSentCount: { increment: 1 },
      },
    });
  });

  it('пустой пакет завершает рассылку', async () => {
    const { worker, prisma } = createWorker({ recipients: [] });

    const done = await sendBatch(worker);

    expect(done).toBe(true);
    expect(prisma.notificationBroadcast.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: containing({ status: 'sent' }),
    });
  });

  it('отменённая посреди отправки останавливается, не тронув следующий пакет', async () => {
    const { worker, prisma, notifications } = createWorker({
      broadcast: { status: 'cancelled' },
      recipients: [allowed],
    });

    const done = await sendBatch(worker);

    expect(done).toBe(true);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(notifications.addManyToInbox).not.toHaveBeenCalled();
  });

  it('протухшую подписку удаляет и не считает доставленной', async () => {
    const { worker, notifications, sender, prisma } = createWorker({
      recipients: [allowed],
      subscriptions: [{ id: 's-1', endpoint: 'e-1', p256dh: 'p', auth: 'a' }],
    });
    sender.send.mockResolvedValue('gone' as never);

    await sendBatch(worker);

    expect(notifications.deleteSubscription).toHaveBeenCalledWith('e-1');
    expect(prisma.notificationBroadcast.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: containing({ pushSentCount: { increment: 0 } }),
    });
  });

  it('пустая ссылка ведёт в список уведомлений, а не в никуда', async () => {
    const { worker, notifications } = createWorker({ recipients: [allowed] });

    await sendBatch(worker);

    expect(notifications.addManyToInbox).toHaveBeenCalledWith(
      ['u-1'],
      expect.objectContaining({ url: '/notifications' }),
    );
  });
});
