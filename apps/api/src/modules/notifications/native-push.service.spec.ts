import type { PrismaService } from '../../prisma/prisma.service';
import type { FcmSenderService } from './fcm-sender.service';
import { NativePushService } from './native-push.service';

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
  const devices =
    options.devices ??
    (options.tokens ?? []).map((token) => ({ token, nativeCalls: false }));
  const prisma = {
    notificationDevice: {
      findMany: jest.fn(() => Promise.resolve(devices)),
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
  const service = new NativePushService(
    prisma as unknown as PrismaService,
    fcm as unknown as FcmSenderService,
  );
  return { service, prisma, fcm };
}

describe('NativePushService.sendToUsers', () => {
  it('шлёт на все телефоны FCM и удаляет только мёртвые токены', async () => {
    const { service, prisma, fcm } = setup({ tokens: ['ok', 'dead', 'busy'] });

    const result = await service.sendToUsers(['u1'], payload);

    expect(result).toEqual({ devices: 3, delivered: 1 });
    expect(fcm.send).toHaveBeenCalledTimes(3);
    expect(prisma.notificationDevice.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['u1'] }, provider: 'fcm' },
      select: { token: true },
    });
    expect(prisma.notificationDevice.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDevice.deleteMany).toHaveBeenCalledWith({
      where: { token: 'dead' },
    });
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
    const { service, prisma, fcm } = setup({
      devices: [
        { token: 'native1', nativeCalls: true },
        { token: 'legacy1', nativeCalls: false },
      ],
    });

    const result = await service.sendCallIncoming('u1', callData, payload);

    expect(result).toEqual({ devices: 2, delivered: 2 });
    expect(prisma.notificationDevice.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', provider: 'fcm' },
      select: { token: true, nativeCalls: true },
    });
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

  it('мёртвый токен нативного устройства удаляется', async () => {
    const { service, prisma } = setup({
      devices: [{ token: 'dead', nativeCalls: true }],
    });

    const result = await service.sendCallIncoming('u1', callData, payload);

    expect(result).toEqual({ devices: 1, delivered: 0 });
    expect(prisma.notificationDevice.deleteMany).toHaveBeenCalledWith({
      where: { token: 'dead' },
    });
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
    const { service, prisma, fcm } = setup({
      devices: [{ token: 'native1', nativeCalls: true }],
    });

    const result = await service.sendCallEnded('u1', 'c1', 'declined');

    expect(result).toEqual({ devices: 1, delivered: 1 });
    expect(prisma.notificationDevice.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', provider: 'fcm', nativeCalls: true },
      select: { token: true, nativeCalls: true },
    });
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
