import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsListener } from './notifications.listener';
import { notificationEventNames } from './notification-copy';
import { NotificationsService } from './notifications.service';
import { PushSenderService } from './push-sender.service';

const chatEvent = {
  name: 'union.chat.message-sent',
  recipientId: 'user-1',
  senderName: 'Вринда',
  body: 'Харе Кришна',
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
  /** Пустой массив — устройство не подписано на пуш. */
  subscriptions?: Array<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
}) {
  const deleted: string[] = [];
  const sent: Array<{ endpoint: string; payload: unknown }> = [];
  const inbox: Array<Record<string, unknown>> = [];
  const notifications = {
    addToInbox: jest.fn((userId: string, draft: Record<string, unknown>) => {
      inbox.push({ userId, ...draft });
      return Promise.resolve();
    }),
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
      Promise.resolve(
        options.subscriptions ?? [
          {
            id: 's1',
            endpoint: 'https://push.example/a',
            p256dh: 'p',
            auth: 'a',
          },
        ],
      ),
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
    inbox,
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

  it('кладёт уведомление в колокольчик', async () => {
    const { listener, inbox } = createListener({});

    await listener.deliver(chatEvent);

    expect(inbox).toEqual([
      {
        userId: 'user-1',
        title: 'Вринда',
        body: 'Харе Кришна',
        url: '/union/chats/r1',
        category: 'chat',
      },
    ]);
  });

  it('наполняет колокольчик даже без пуш-подписок', async () => {
    const { listener, inbox, sent } = createListener({ subscriptions: [] });

    await listener.deliver(chatEvent);

    expect(inbox).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it('не кладёт в колокольчик то, что человек отключил в настройках', async () => {
    const { listener, inbox } = createListener({
      preferences: { chat: false },
    });

    await listener.deliver(chatEvent);

    expect(inbox).toEqual([]);
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

/**
 * Каждое имя события в notificationEventNames обязано иметь свой @OnEvent
 * в NotificationsListener — иначе событие эмитится, но никто его не
 * доставляет, и это молча теряется (ровно так едва не случилось с
 * team.application.received: событие завели в notification-copy.ts, но
 * забыли обработчик здесь — заодно нашлись ещё четыре таких же дыры).
 */
describe('NotificationsListener wiring', () => {
  it('has a live @OnEvent handler for every registered event name', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        NotificationsListener,
        { provide: NotificationsService, useValue: {} },
        { provide: PushSenderService, useValue: {} },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const listener = moduleRef.get(NotificationsListener);
    const deliverSpy = jest
      .spyOn(listener, 'deliver')
      .mockResolvedValue(undefined);
    const emitter = moduleRef.get(EventEmitter2);

    for (const name of Object.values(notificationEventNames)) {
      emitter.emit(name, { name, recipientId: 'user-1' });
    }

    expect(deliverSpy).toHaveBeenCalledTimes(
      Object.values(notificationEventNames).length,
    );

    await app.close();
  });
});
