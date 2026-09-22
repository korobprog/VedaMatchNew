import type { PrismaService } from '../../prisma/prisma.service';
import type { FcmSenderService } from './fcm-sender.service';
import { NativePushService } from './native-push.service';
import type { NotificationsService } from './notifications.service';

/** Отметки живости, которые тянет выборка устройств (VED-314). */
const health = {
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  lastSuccessAt: null,
  failureCount: 0,
  lastSeenAt: null,
  deadSince: null,
};

const payload = { title: 't', body: 'b', url: '/chat/c1', tag: 'chat:c1' };
const callData = {
  callId: 'c1',
  conversationId: 'conv1',
  kind: 'audio' as const,
  callerName: 'Радха',
  callerAvatarUrl: null,
  expiresAt: '2026-09-17T10:00:45.000Z',
};

function setup(
  options: {
    configured?: boolean;
    tokens?: string[];
    devices?: { token: string; nativeCalls?: boolean }[];
  } = {},
) {
  const devices = (
    options.devices ??
    (options.tokens ?? []).map((token) => ({ token, nativeCalls: false }))
  ).map((device) => ({ ...health, ...device }));
  /** Запросы к базе — списком: `select` проверяется по полям, а не целиком
   *  (в нём ещё и отметки живости, VED-314). */
  const queries: Array<{ where: unknown; select: Record<string, unknown> }> =
    [];
  const prisma = {
    notificationDevice: {
      findMany: jest.fn(
        (args: { where: unknown; select: Record<string, unknown> }) => {
          queries.push(args);
          return Promise.resolve(devices);
        },
      ),
      deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
  };
  const fcm = {
    configured: options.configured ?? true,
    send: jest.fn((token: string) =>
      Promise.resolve(
        token === 'dead' ? 'gone' : token === 'busy' ? 'transient' : null,
      ),
    ),
    sendRaw: jest.fn(
      (message: { message: { token: string; data: Record<string, string> } }) =>
        Promise.resolve(
          message.message.token === 'dead'
            ? 'gone'
            : message.message.token === 'busy'
              ? 'transient'
              : null,
        ),
    ),
  };
  /* Итог каждой попытки уходит в общий конвейер (VED-314): он и удаляет
     протухший токен, и ведёт отметки живости. */
  const results: Array<{ token: string; failure: string | null }> = [];
  const notifications = {
    recordDeviceResult: jest.fn(
      (device: { token: string }, failure: string | null) => {
        results.push({ token: device.token, failure });
        return Promise.resolve();
      },
    ),
  } as unknown as NotificationsService;
  const service = new NativePushService(
    prisma as unknown as PrismaService,
    fcm as unknown as FcmSenderService,
    notifications,
  );
  return { service, prisma, fcm, notifications, results, queries };
}

describe('NativePushService.sendToUsers', () => {
  it('шлёт на все телефоны FCM и сообщает исход каждой попытки', async () => {
    const { service, fcm, results, queries } = setup({
      tokens: ['ok', 'dead', 'busy'],
    });

    const result = await service.sendToUsers(['u1'], payload);

    expect(result).toEqual({ devices: 3, delivered: 1 });
    expect(fcm.send).toHaveBeenCalledTimes(3);
    expect(queries[0].where).toEqual({
      userId: { in: ['u1'] },
      provider: 'fcm',
    });
    expect(queries[0].select.lastSuccessAt).toBe(true);
    // Успех — тоже событие: без отметки приёма живую точку не отличить от
    // мёртвой, ради чего VED-314 и затевалась.
    expect(results).toEqual([
      { token: 'ok', failure: null },
      { token: 'dead', failure: 'gone' },
      { token: 'busy', failure: 'transient' },
    ]);
  });

  it('без ключа FCM не ходит в базу', async () => {
    const { service, prisma } = setup({ configured: false, tokens: ['ok'] });

    await expect(service.sendToUsers(['u1'], payload)).resolves.toEqual({
      devices: 0,
      delivered: 0,
    });
    expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
  });

  it('пустой список людей ничего не делает', async () => {
    const { service, prisma } = setup({ tokens: ['ok'] });

    await service.sendToUsers([], payload);

    expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
  });
});

describe('NativePushService.sendCallIncoming', () => {
  it('устройствам с nativeCalls — data-only пуш, остальным — обычный', async () => {
    const { service, fcm, queries } = setup({
      devices: [
        { token: 'native1', nativeCalls: true },
        { token: 'legacy1', nativeCalls: false },
      ],
    });

    const result = await service.sendCallIncoming('u1', callData, payload);

    expect(result).toEqual({ devices: 2, delivered: 2 });
    expect(queries[0].where).toEqual({ userId: 'u1', provider: 'fcm' });
    expect(queries[0].select.nativeCalls).toBe(true);
    // Нативному устройству — сырое data-сообщение через sendRaw.
    expect(fcm.sendRaw).toHaveBeenCalledTimes(1);
    expect(fcm.sendRaw.mock.calls[0][0].message.token).toBe('native1');
    expect(fcm.sendRaw.mock.calls[0][0].message.data.type).toBe(
      'call.incoming',
    );
    // Обычному — тот же payload, что ушёл бы веб-браузеру.
    expect(fcm.send).toHaveBeenCalledTimes(1);
    expect(fcm.send).toHaveBeenCalledWith('legacy1', payload);
  });

  it('мёртвый токен нативного устройства уходит в конвейер как gone', async () => {
    const { service, results } = setup({
      devices: [{ token: 'dead', nativeCalls: true }],
    });

    const result = await service.sendCallIncoming('u1', callData, payload);

    expect(result).toEqual({ devices: 1, delivered: 0 });
    expect(results).toEqual([{ token: 'dead', failure: 'gone' }]);
  });

  it('без ключа FCM не ходит в базу', async () => {
    const { service, prisma } = setup({
      configured: false,
      devices: [{ token: 'native1', nativeCalls: true }],
    });

    await expect(
      service.sendCallIncoming('u1', callData, payload),
    ).resolves.toEqual({ devices: 0, delivered: 0 });
    expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
  });
});

describe('NativePushService.sendCallEnded', () => {
  it('шлёт data-only «звонок снят» только устройствам с nativeCalls', async () => {
    const { service, fcm, queries } = setup({
      devices: [{ token: 'native1', nativeCalls: true }],
    });

    const result = await service.sendCallEnded('u1', 'c1', 'declined');

    expect(result).toEqual({ devices: 1, delivered: 1 });
    expect(queries[0].where).toEqual({
      userId: 'u1',
      provider: 'fcm',
      nativeCalls: true,
    });
    expect(queries[0].select.nativeCalls).toBe(true);
    expect(fcm.sendRaw).toHaveBeenCalledTimes(1);
    const sent = fcm.sendRaw.mock.calls[0][0];
    expect(sent.message.data).toEqual({
      type: 'call.ended',
      callId: 'c1',
      reason: 'declined',
    });
  });

  it('без ключа FCM не ходит в базу', async () => {
    const { service, prisma } = setup({ configured: false });

    await expect(service.sendCallEnded('u1', 'c1', 'ended')).resolves.toEqual({
      devices: 0,
      delivered: 0,
    });
    expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
  });
});
