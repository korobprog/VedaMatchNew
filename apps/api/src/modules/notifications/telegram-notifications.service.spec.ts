import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from './notifications.service';
import {
  TELEGRAM_DEVICE_PLATFORM,
  TELEGRAM_DEVICE_PROVIDER,
  TelegramNotificationsService,
} from './telegram-notifications.service';

function setup() {
  const prisma = {
    notificationDevice: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const notifications = {
    getPreferences: jest.fn().mockResolvedValue({ telegram: true }),
    updatePreferences: jest.fn().mockResolvedValue({ telegram: false }),
  };
  const service = new TelegramNotificationsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, notifications };
}

describe('TelegramNotificationsService.setConnected', () => {
  it('canWrite — заводит устройство upsert по id телеграм-чата', async () => {
    const { service, prisma } = setup();
    await service.setConnected('u1', '777', true);
    expect(prisma.notificationDevice.upsert).toHaveBeenCalledWith({
      where: { token: '777' },
      create: {
        userId: 'u1',
        provider: TELEGRAM_DEVICE_PROVIDER,
        platform: TELEGRAM_DEVICE_PLATFORM,
        token: '777',
      },
      update: {
        userId: 'u1',
        provider: TELEGRAM_DEVICE_PROVIDER,
        platform: TELEGRAM_DEVICE_PLATFORM,
        token: '777',
      },
    });
  });

  it('без canWrite — устройство не трогается', async () => {
    const { service, prisma } = setup();
    await service.setConnected('u1', '777', false);
    expect(prisma.notificationDevice.upsert).not.toHaveBeenCalled();
  });

  /**
   * Раунд оценки вехи 4, п.7: обработчик `auth.telegram.connected` не должен
   * молча отнимать устройство у другого аккаунта без предшествующего
   * `disconnect()`. `auth` гарантирует, что это событие шлётся только для
   * фактического текущего владельца идентичности (см. комментарий в
   * сервисе) — здесь проверяется наблюдаемое поведение на случай нарушения
   * этой гарантии: не падает, устройство переезжает, но пишется
   * предупреждение, которое можно найти в логах.
   */
  it('токен уже принадлежит другому пользователю — переносит устройство и предупреждает в логе', async () => {
    const { service, prisma } = setup();
    prisma.notificationDevice.findUnique.mockResolvedValue({
      userId: 'govinda',
    });
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation();

    await service.setConnected('radha', '770402', true);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('770402'));
    expect(prisma.notificationDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: '770402' },
        create: expect.objectContaining({ userId: 'radha' }),
      }),
    );
  });

  it('токен свободен или уже принадлежит тому же пользователю — без предупреждения', async () => {
    const { service, prisma } = setup();
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation();

    await service.setConnected('radha', '770402', true);
    expect(warn).not.toHaveBeenCalled();

    prisma.notificationDevice.findUnique.mockResolvedValue({ userId: 'radha' });
    await service.setConnected('radha', '770402', true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('TelegramNotificationsService.disconnect', () => {
  it('гасит устройство безусловно, тумблер не трогает', async () => {
    const { service, prisma, notifications } = setup();
    await service.disconnect('u1');
    expect(prisma.notificationDevice.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', provider: TELEGRAM_DEVICE_PROVIDER },
    });
    expect(notifications.updatePreferences).not.toHaveBeenCalled();
  });
});

describe('TelegramNotificationsService.deleteDevice', () => {
  it('удаляет протухшее устройство по токену и провайдеру', async () => {
    const { service, prisma } = setup();
    await service.deleteDevice('777');
    expect(prisma.notificationDevice.deleteMany).toHaveBeenCalledWith({
      where: { token: '777', provider: TELEGRAM_DEVICE_PROVIDER },
    });
  });
});

describe('TelegramNotificationsService.status', () => {
  it('connected — есть хотя бы одно устройство', async () => {
    const { service, prisma } = setup();
    prisma.notificationDevice.findFirst.mockResolvedValue({ id: 'd1' });
    await expect(service.status('u1')).resolves.toEqual({
      connected: true,
      enabled: true,
    });
  });

  it('нет устройства — connected false', async () => {
    const { service } = setup();
    await expect(service.status('u1')).resolves.toEqual({
      connected: false,
      enabled: true,
    });
  });
});

describe('TelegramNotificationsService.setEnabled', () => {
  it('обновляет тумблер через NotificationsService и отдаёт статус', async () => {
    const { service, notifications } = setup();
    await service.setEnabled('u1', false);
    expect(notifications.updatePreferences).toHaveBeenCalledWith('u1', {
      telegram: false,
    });
  });
});

describe('TelegramNotificationsService.enable', () => {
  it('заводит устройство явным разрешением и отдаёт статус', async () => {
    const { service, prisma } = setup();
    prisma.notificationDevice.findFirst.mockResolvedValue({ id: 'd1' });
    await expect(service.enable('u1', '777')).resolves.toEqual({
      connected: true,
      enabled: true,
    });
    expect(prisma.notificationDevice.upsert).toHaveBeenCalled();
  });
});

describe('TelegramNotificationsService.listDevices', () => {
  it('отдаёт токены устройств получателя', async () => {
    const { service, prisma } = setup();
    prisma.notificationDevice.findMany.mockResolvedValue([{ token: '777' }]);
    await expect(service.listDevices('u1')).resolves.toEqual([
      { token: '777' },
    ]);
    expect(prisma.notificationDevice.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', provider: TELEGRAM_DEVICE_PROVIDER },
      select: { token: true },
    });
  });
});
