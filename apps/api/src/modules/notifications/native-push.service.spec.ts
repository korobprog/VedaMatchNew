import type { PrismaService } from '../../prisma/prisma.service';
import type { FcmSenderService } from './fcm-sender.service';
import { NativePushService } from './native-push.service';

const payload = { title: 't', body: 'b', url: '/chat/c1', tag: 'chat:c1' };

function setup(options: { configured?: boolean; tokens?: string[] } = {}) {
  const prisma = {
    notificationDevice: {
      findMany: jest.fn(() =>
        Promise.resolve((options.tokens ?? []).map((token) => ({ token }))),
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
  };
  const service = new NativePushService(
    prisma as unknown as PrismaService,
    fcm as unknown as FcmSenderService,
  );
  return { service, prisma, fcm };
}

describe('NativePushService', () => {
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
