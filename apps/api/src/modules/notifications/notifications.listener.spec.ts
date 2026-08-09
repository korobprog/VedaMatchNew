import { NotificationsListener } from './notifications.listener';
import type { NotificationsService } from './notifications.service';
import type { PushSenderService } from './push-sender.service';

const chatEvent = {
  name: 'union.chat.message-sent',
  recipientId: 'user-1',
  senderName: 'Вринда',
  excerpt: 'Харе Кришна',
  requestId: 'r1',
} as const;

function createListener(options: {
  preferences?: Partial<{
    enabled: boolean;
    chat: boolean;
    connections: boolean;
    support: boolean;
  }>;
  sendResult?: 'gone' | 'rate-limited' | 'transient' | null;
}) {
  const deleted: string[] = [];
  const sent: Array<{ endpoint: string; payload: unknown }> = [];
  const notifications = {
    getPreferences: jest.fn(() =>
      Promise.resolve({
        enabled: true,
        chat: true,
        connections: true,
        support: true,
        ...options.preferences,
      }),
    ),
    listSubscriptions: jest.fn(() =>
      Promise.resolve([
        {
          id: 's1',
          endpoint: 'https://push.example/a',
          p256dh: 'p',
          auth: 'a',
        },
      ]),
    ),
    deleteSubscription: jest.fn((endpoint: string) => {
      deleted.push(endpoint);
      return Promise.resolve();
    }),
  } as unknown as NotificationsService;
  const sender = {
    send: jest.fn((subscription: { endpoint: string }, payload: unknown) => {
      sent.push({ endpoint: subscription.endpoint, payload });
      return Promise.resolve(options.sendResult ?? null);
    }),
  } as unknown as PushSenderService;

  return {
    listener: new NotificationsListener(notifications, sender),
    notifications,
    sender,
    deleted,
    sent,
  };
}

describe('NotificationsListener.deliver', () => {
  it('отправляет пуш с текстом из notification-copy', async () => {
    const { listener, sent } = createListener({});

    await listener.deliver(chatEvent);

    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toEqual({
      title: 'Вринда',
      body: 'Харе Кришна',
      url: '/union/chats/r1',
      tag: 'chat:r1',
    });
  });

  it('молчит, когда уведомления выключены целиком', async () => {
    const { listener, sender } = createListener({
      preferences: { enabled: false },
    });

    await listener.deliver(chatEvent);

    expect(sender.send).not.toHaveBeenCalled();
  });

  it('молчит, когда выключена именно категория события', async () => {
    const { listener, sender } = createListener({
      preferences: { chat: false },
    });

    await listener.deliver(chatEvent);

    expect(sender.send).not.toHaveBeenCalled();
  });

  it('шлёт заявку, даже если чат отключён — это разные категории', async () => {
    const { listener, sender } = createListener({
      preferences: { chat: false },
    });

    await listener.deliver({
      name: 'union.connection.requested',
      recipientId: 'user-1',
      senderName: 'Мадхава',
    });

    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('удаляет подписку, которую пуш-сервис признал мёртвой', async () => {
    const { listener, deleted } = createListener({ sendResult: 'gone' });

    await listener.deliver(chatEvent);

    expect(deleted).toEqual(['https://push.example/a']);
  });

  it('сохраняет подписку при временном лимите', async () => {
    const { listener, deleted } = createListener({
      sendResult: 'rate-limited',
    });

    await listener.deliver(chatEvent);

    expect(deleted).toEqual([]);
  });

  it('не отклоняется, когда хранилище недоступно: иначе упал бы процесс', async () => {
    const { listener, notifications } = createListener({});
    jest
      .mocked(notifications.getPreferences)
      .mockRejectedValueOnce(new Error('database is down'));

    await expect(listener.deliver(chatEvent)).resolves.toBeUndefined();
  });
});
