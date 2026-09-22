import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import {
  AUTH_TELEGRAM_CONNECTED_EVENT,
  AUTH_TELEGRAM_DISCONNECTED_EVENT,
  CHAT_CALL_ENDED_EVENT,
  WORK_TASK_MARK_REFRESHED_EVENT,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NativePushService } from './native-push.service';
import { NotificationsListener } from './notifications.listener';
import { notificationEventNames } from './notification-copy';
import { NotificationsService } from './notifications.service';
import { PushSenderService } from './push-sender.service';
import { TelegramNotificationsService } from './telegram-notifications.service';
import { TelegramSenderService } from './telegram-sender.service';

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
    announcements: boolean;
    telegram: boolean;
  }>;
  sendResult?: 'gone' | 'rate-limited' | 'transient' | null;
  /** Пустой массив — устройство не подписано на пуш. */
  subscriptions?: Array<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
  telegramDevices?: Array<{ token: string }>;
  telegramSendResult?:
    'gone' | 'rate-limited' | 'transient' | 'permanent' | null;
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
        // Звонки — своя категория (VED-361): без неё `preferences.calls`
        // был бы `undefined`, и доставка молча гасила бы вызовы.
        calls: true,
        connections: true,
        support: true,
        telegram: true,
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
    /* Итог попытки в отметки живости (VED-314). Мёртвую подписку и мёртвое
       устройство удаляет сам конвейер, поэтому набор ведёт учёт здесь. */
    recordPushResult: jest.fn(
      (subscription: { endpoint: string }, failure: string | null) => {
        if (failure === 'gone') deleted.push(subscription.endpoint);
        return Promise.resolve();
      },
    ),
    recordDeviceResult: jest.fn(
      (device: { token: string }, failure: string | null) => {
        if (failure === 'gone') telegramDeleted.push(device.token);
        return Promise.resolve();
      },
    ),
  } as unknown as NotificationsService;
  const sender = {
    vapidConfigured: true,
    send: jest.fn((subscription: { endpoint: string }, payload: unknown) => {
      sent.push({ endpoint: subscription.endpoint, payload });
      return Promise.resolve(options.sendResult ?? null);
    }),
  } as unknown as PushSenderService;

  /* Приветствие читает имя из `User` — в наборе оно одно на всех: тесты
     доставки про имя ничего не знают, им важен путь уведомления. */
  const prisma = {
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({ name: 'Иван', spiritualName: null }),
      ),
    },
  } as unknown as PrismaService;

  const nativePush = {
    sendToUsers: jest.fn(() => Promise.resolve({ devices: 0, delivered: 0 })),
    sendCallIncoming: jest.fn(() =>
      Promise.resolve({ devices: 0, delivered: 0 }),
    ),
    sendCallEnded: jest.fn(() => Promise.resolve({ devices: 0, delivered: 0 })),
  } as unknown as NativePushService;

  const telegramDeleted: string[] = [];
  const telegramNotifications = {
    listDevices: jest.fn(() => Promise.resolve(options.telegramDevices ?? [])),
    deleteDevice: jest.fn((token: string) => {
      telegramDeleted.push(token);
      return Promise.resolve();
    }),
    setConnected: jest.fn(() => Promise.resolve()),
    disconnect: jest.fn(() => Promise.resolve()),
  } as unknown as TelegramNotificationsService;
  const telegramSent: Array<{ chatId: string; title: string; body: string }> =
    [];
  const telegramSender = {
    sendMessage: jest.fn(
      (params: {
        chatId: string;
        title: string;
        body: string;
        notificationUrl: string;
      }) => {
        telegramSent.push({
          chatId: params.chatId,
          title: params.title,
          body: params.body,
        });
        return Promise.resolve(options.telegramSendResult ?? null);
      },
    ),
  } as unknown as TelegramSenderService;

  return {
    listener: new NotificationsListener(
      notifications,
      sender,
      prisma,
      nativePush,
      telegramNotifications,
      telegramSender,
    ),
    prisma,
    notifications,
    sender,
    nativePush,
    telegramNotifications,
    telegramSender,
    telegramDeleted,
    telegramSent,
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
        // Значка у переписки нет (VED-272): он бывает только там, где
        // событие принесло название колонки доски.
        mark: null,
      },
    ]);
  });

  it('кладёт значок состояния в колокольчик, но не в пуш (VED-272)', async () => {
    const { listener, inbox, sent } = createListener({
      // `work` в наборе по умолчанию нет, а без тумблера доставка молчит.
      preferences: { work: true } as Record<string, boolean>,
    });

    await listener.deliver({
      name: 'work.task.status-changed',
      recipientId: 'user-1',
      spaceId: 'space-1',
      taskKey: 'VED-42',
      taskTitle: 'Починить ссылки',
      fromColumnName: 'В работе',
      toColumnName: 'На доработку',
      actorName: 'Санкаршан',
      statusMark: 'rework',
    });

    expect(inbox[0]).toMatchObject({ mark: 'rework' });
    // В шторке пуша одна строка текста — размечать значок там негде.
    expect(sent[0]?.payload).not.toHaveProperty('mark');
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

  /**
   * VED-361: тумблеры «Сообщения» и «Звонки» независимы. Раньше звонок шёл
   * категорией `chat`, и человек, выключивший переписку, о входящем при
   * закрытом приложении не узнавал вовсе.
   */
  const callEvent = {
    name: 'chat.call-incoming',
    recipientId: 'user-1',
    callerName: 'Радха',
    callerAvatarUrl: null,
    callId: 'call-1',
    conversationId: 'conv-1',
    callKind: 'audio',
    expiresAt: '2026-09-17T10:00:45.000Z',
  } as const;

  it('звонок звонит, когда выключены «Сообщения»', async () => {
    const { listener, nativePush, inbox } = createListener({
      preferences: { chat: false, calls: true },
    });

    await listener.deliver(callEvent);

    expect(nativePush.sendCallIncoming).toHaveBeenCalledTimes(1);
    expect(inbox).toHaveLength(1);
  });

  it('звонок молчит, когда выключены «Звонки»', async () => {
    const { listener, nativePush, sender, inbox } = createListener({
      preferences: { calls: false },
    });

    await listener.deliver(callEvent);

    expect(nativePush.sendCallIncoming).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
    expect(inbox).toEqual([]);
  });

  it('сообщение приходит, когда выключены «Звонки»', async () => {
    const { listener, sender } = createListener({
      preferences: { calls: false },
    });

    await listener.deliver(chatEvent);

    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('обе категории выключены — не приходит ничего', async () => {
    const { listener, nativePush, sender } = createListener({
      preferences: { chat: false, calls: false },
    });

    await listener.deliver(callEvent);
    await listener.deliver(chatEvent);

    expect(nativePush.sendCallIncoming).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('пропущенный звонок выключается тумблером звонков, а не переписки', async () => {
    const missed = {
      name: 'chat.call-missed',
      recipientId: 'user-1',
      callerName: 'Радха',
      conversationId: 'conv-1',
      callKind: 'audio',
    } as const;

    const quietChat = createListener({ preferences: { chat: false } });
    await quietChat.listener.deliver(missed);
    expect(quietChat.sender.send).toHaveBeenCalledTimes(1);

    const quietCalls = createListener({ preferences: { calls: false } });
    await quietCalls.listener.deliver(missed);
    expect(quietCalls.sender.send).not.toHaveBeenCalled();
  });

  it('входящий звонок идёт через sendCallIncoming, а не sendToUsers', async () => {
    const { listener, nativePush } = createListener({});

    await listener.deliver({
      name: 'chat.call-incoming',
      recipientId: 'user-1',
      callerName: 'Радха',
      callerAvatarUrl: 'https://cdn.example/a.jpg',
      callId: 'call-1',
      conversationId: 'conv-1',
      callKind: 'video',
      expiresAt: '2026-09-17T10:00:45.000Z',
    });

    expect(nativePush.sendCallIncoming).toHaveBeenCalledWith(
      'user-1',
      {
        callId: 'call-1',
        conversationId: 'conv-1',
        kind: 'video',
        callerName: 'Радха',
        callerAvatarUrl: 'https://cdn.example/a.jpg',
        expiresAt: '2026-09-17T10:00:45.000Z',
      },
      {
        title: 'Радха',
        body: 'Входящий видеозвонок',
        url: '/chat/conv-1?call=call-1',
        tag: 'call:call-1',
      },
    );
    expect(nativePush.sendToUsers).not.toHaveBeenCalled();
  });

  it('групповой звонок — обычный пуш, а не нативный вызов', async () => {
    const { listener, nativePush } = createListener({});

    await listener.deliver({
      name: 'chat.group-call-started',
      recipientId: 'user-1',
      conversationTitle: 'Вайшнавы Москвы',
      conversationId: 'conv-1',
      callId: 'room-1',
      starterName: 'Радха',
    });

    // Нативный экран вызова поднимает только `chat.call-incoming`. Комната
    // открыта постоянно, «принять» её нечем, и трое в беседе означали бы
    // три звонка на телефон.
    expect(nativePush.sendCallIncoming).not.toHaveBeenCalled();
    expect(nativePush.sendToUsers).toHaveBeenCalledWith(
      ['user-1'],
      {
        title: 'Вайшнавы Москвы',
        body: 'Радха зовёт в групповой звонок',
        url: '/chat/conv-1',
        tag: 'group-call:room-1',
      },
      // Канал «Звонки» (VED-361): обычный пуш, но выключается он вместе с
      // остальными звонками, а не вместе с перепиской.
      'calls',
    );
  });

  it('прочие события всё ещё идут через sendToUsers', async () => {
    const { listener, nativePush } = createListener({});

    await listener.deliver(chatEvent);

    expect(nativePush.sendToUsers).toHaveBeenCalledTimes(1);
    expect(nativePush.sendCallIncoming).not.toHaveBeenCalled();
  });
});

describe('NotificationsListener.deliver — Telegram', () => {
  it('шлёт сообщение боту на каждое устройство telegram, если тумблер включён', async () => {
    const { listener, telegramSent } = createListener({
      telegramDevices: [{ token: '777' }],
    });

    await listener.deliver(chatEvent);

    expect(telegramSent).toEqual([
      { chatId: '777', title: 'Вринда', body: 'Харе Кришна' },
    ]);
  });

  it('тумблер telegram выключен — устройства не читаются, бот молчит', async () => {
    const { listener, telegramNotifications, telegramSender } = createListener({
      preferences: { telegram: false },
      telegramDevices: [{ token: '777' }],
    });

    await listener.deliver(chatEvent);

    expect(telegramNotifications.listDevices).not.toHaveBeenCalled();
    expect(telegramSender.sendMessage).not.toHaveBeenCalled();
  });

  it('входящий звонок — эмодзи и «от кого» вместо короткой подписи пуша', async () => {
    const { listener, telegramSent } = createListener({
      telegramDevices: [{ token: '777' }],
    });

    await listener.deliver({
      name: 'chat.call-incoming',
      recipientId: 'user-1',
      callerName: 'Радха',
      callerAvatarUrl: null,
      callId: 'call-1',
      conversationId: 'conv-1',
      callKind: 'audio',
      expiresAt: '2026-09-18T10:00:45.000Z',
    });

    expect(telegramSent).toEqual([
      {
        chatId: '777',
        title: 'Радха',
        body: '📞 Входящий звонок от Радха',
      },
    ]);
  });

  it('устройство протухло (gone) — удаляется, доставка не прерывается', async () => {
    const { listener, telegramDeleted } = createListener({
      telegramDevices: [{ token: '777' }],
      telegramSendResult: 'gone',
    });

    await listener.deliver(chatEvent);

    expect(telegramDeleted).toEqual(['777']);
  });

  it('устройство временно недоступно — не удаляется', async () => {
    const { listener, telegramDeleted } = createListener({
      telegramDevices: [{ token: '777' }],
      telegramSendResult: 'transient',
    });

    await listener.deliver(chatEvent);

    expect(telegramDeleted).toEqual([]);
  });

  it('только устройство Telegram, без веб-пуша и телефона — колокольчик и лог всё равно наполняются', async () => {
    const { listener, inbox, sent } = createListener({
      subscriptions: [],
      telegramDevices: [{ token: '777' }],
    });

    await listener.deliver(chatEvent);

    expect(inbox).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });
});

describe('NotificationsListener «звонок снят»', () => {
  it('не идёт в колокольчик и веб-пуш — только data-пуш нативным устройствам', async () => {
    const { listener, nativePush, notifications, sender } = createListener({});

    listener.onChatCallEnded({
      name: CHAT_CALL_ENDED_EVENT,
      recipientId: 'user-1',
      callId: 'call-1',
      reason: 'declined',
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(nativePush.sendCallEnded).toHaveBeenCalledWith(
      'user-1',
      'call-1',
      'declined',
    );
    expect(notifications.addToInbox).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('не роняет процесс, если пуш-сервис недоступен', () => {
    const { listener, nativePush } = createListener({});
    jest
      .mocked(nativePush.sendCallEnded)
      .mockRejectedValueOnce(new Error('fcm down'));

    expect(() =>
      listener.onChatCallEnded({
        name: CHAT_CALL_ENDED_EVENT,
        recipientId: 'user-1',
        callId: 'call-1',
        reason: 'missed',
      }),
    ).not.toThrow();
  });
});

describe('NotificationsListener «связка с Telegram»', () => {
  it('auth.telegram.connected — заводит устройство через TelegramNotificationsService', async () => {
    const { listener, telegramNotifications } = createListener({});

    listener.onTelegramConnected({
      name: AUTH_TELEGRAM_CONNECTED_EVENT,
      userId: 'user-1',
      telegramUserId: '777',
      canWrite: true,
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(telegramNotifications.setConnected).toHaveBeenCalledWith(
      'user-1',
      '777',
      true,
    );
  });

  it('не роняет процесс, если устройство не завелось', () => {
    const { listener, telegramNotifications } = createListener({});
    jest
      .mocked(telegramNotifications.setConnected)
      .mockRejectedValueOnce(new Error('database is down'));

    expect(() =>
      listener.onTelegramConnected({
        name: AUTH_TELEGRAM_CONNECTED_EVENT,
        userId: 'user-1',
        telegramUserId: '777',
        canWrite: true,
      }),
    ).not.toThrow();
  });

  it('auth.telegram.disconnected — гасит устройство через TelegramNotificationsService', async () => {
    const { listener, telegramNotifications } = createListener({});

    listener.onTelegramDisconnected({
      name: AUTH_TELEGRAM_DISCONNECTED_EVENT,
      userId: 'user-1',
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(telegramNotifications.disconnect).toHaveBeenCalledWith('user-1');
  });

  it('не роняет процесс, если отвязка не удалась', () => {
    const { listener, telegramNotifications } = createListener({});
    jest
      .mocked(telegramNotifications.disconnect)
      .mockRejectedValueOnce(new Error('database is down'));

    expect(() =>
      listener.onTelegramDisconnected({
        name: AUTH_TELEGRAM_DISCONNECTED_EVENT,
        userId: 'user-1',
      }),
    ).not.toThrow();
  });
});

/**
 * Каждое имя события в notificationEventNames обязано иметь свой @OnEvent
 * в NotificationsListener — иначе событие эмитится, но никто его не
 * доставляет, и это молча теряется (ровно так едва не случилось с
 * team.application.received: событие завели в notification-copy.ts, но
 * забыли обработчик здесь — заодно нашлись ещё четыре таких же дыры).
 */
describe('приветствие новому участнику', () => {
  it('на регистрацию шлёт приветствие с именем из User', async () => {
    const { listener, inbox } = createListener({
      preferences: { announcements: true },
    });

    await listener['welcome']('u-1');

    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      userId: 'u-1',
      title: 'Добро пожаловать, Иван!',
      url: '/welcome',
    });
  });

  it('молчит, если человека уже нет: приветствие не повод падать', async () => {
    const { listener, prisma, inbox } = createListener({});
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await listener['welcome']('u-404');

    expect(inbox).toHaveLength(0);
  });
});

describe('NotificationsListener wiring', () => {
  it('has a live @OnEvent handler for every registered event name', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        NotificationsListener,
        { provide: NotificationsService, useValue: {} },
        { provide: PushSenderService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: NativePushService, useValue: {} },
        { provide: TelegramNotificationsService, useValue: {} },
        { provide: TelegramSenderService, useValue: {} },
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

  it('has a live @OnEvent handler for chat.call-ended', async () => {
    const nativePush = {
      sendCallEnded: jest.fn(() =>
        Promise.resolve({ devices: 0, delivered: 0 }),
      ),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        NotificationsListener,
        { provide: NotificationsService, useValue: {} },
        { provide: PushSenderService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: NativePushService, useValue: nativePush },
        { provide: TelegramNotificationsService, useValue: {} },
        { provide: TelegramSenderService, useValue: {} },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    const emitter = moduleRef.get(EventEmitter2);

    emitter.emit(CHAT_CALL_ENDED_EVENT, {
      name: CHAT_CALL_ENDED_EVENT,
      recipientId: 'user-1',
      callId: 'call-1',
      reason: 'ended',
    });

    expect(nativePush.sendCallEnded).toHaveBeenCalledWith(
      'user-1',
      'call-1',
      'ended',
    );

    await app.close();
  });

  it('has a live @OnEvent handler for work.task.mark-refreshed', async () => {
    // VED-320: без этого обработчика пометка в ленте молча остаётся снимком
    // прошлой колонки — ровно той жалобой, с которой всё началось.
    const notifications = {
      refreshWorkTaskMark: jest.fn(() => Promise.resolve(1)),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        NotificationsListener,
        { provide: NotificationsService, useValue: notifications },
        { provide: PushSenderService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: NativePushService, useValue: {} },
        { provide: TelegramNotificationsService, useValue: {} },
        { provide: TelegramSenderService, useValue: {} },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    const emitter = moduleRef.get(EventEmitter2);

    emitter.emit(WORK_TASK_MARK_REFRESHED_EVENT, {
      name: WORK_TASK_MARK_REFRESHED_EVENT,
      spaceId: 'space-1',
      taskKey: 'VED-42',
      statusMark: 'testing',
    });

    expect(notifications.refreshWorkTaskMark).toHaveBeenCalledWith(
      'space-1',
      'VED-42',
      'testing',
    );

    await app.close();
  });

  it('has live @OnEvent handlers for auth.telegram.connected/disconnected', async () => {
    const telegramNotifications = {
      setConnected: jest.fn(() => Promise.resolve()),
      disconnect: jest.fn(() => Promise.resolve()),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        NotificationsListener,
        { provide: NotificationsService, useValue: {} },
        { provide: PushSenderService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: NativePushService, useValue: {} },
        {
          provide: TelegramNotificationsService,
          useValue: telegramNotifications,
        },
        { provide: TelegramSenderService, useValue: {} },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    const emitter = moduleRef.get(EventEmitter2);

    emitter.emit(AUTH_TELEGRAM_CONNECTED_EVENT, {
      name: AUTH_TELEGRAM_CONNECTED_EVENT,
      userId: 'user-1',
      telegramUserId: '777',
      canWrite: true,
    });
    emitter.emit(AUTH_TELEGRAM_DISCONNECTED_EVENT, {
      name: AUTH_TELEGRAM_DISCONNECTED_EVENT,
      userId: 'user-2',
    });

    expect(telegramNotifications.setConnected).toHaveBeenCalledWith(
      'user-1',
      '777',
      true,
    );
    expect(telegramNotifications.disconnect).toHaveBeenCalledWith('user-2');

    await app.close();
  });
});
