import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AstroSettingsService } from '../astro-settings.service';
import { AstroTransitService } from './astro-transit.service';
import { AstroTransitWorkerService } from './astro-transit-worker.service';

const NOW = new Date('2026-08-10T03:00:00.000Z');
const NO_REDIS_CONFIG = { get: () => undefined } as unknown as ConfigService;

describe('AstroTransitWorkerService', () => {
  const prisma = {
    astroBirthData: { findMany: jest.fn() },
    astroTransitDigest: { updateMany: jest.fn() },
  };
  const transits = { today: jest.fn() };
  const settings = { get: jest.fn() };
  const events = { emit: jest.fn() };

  // Свежий экземпляр на каждый тест: внутри воркера живёт lastRunDate —
  // идемпотентность на сутки, — и общий на describe объект утёк бы это
  // состояние между независимыми тестами одного и того же NOW.
  let worker: AstroTransitWorkerService;

  beforeEach(() => {
    jest.resetAllMocks();
    settings.get.mockResolvedValue({ enabled: true, transitPushEnabled: true });
    prisma.astroBirthData.findMany.mockResolvedValue([]);
    prisma.astroTransitDigest.updateMany.mockResolvedValue({ count: 1 });
    worker = new AstroTransitWorkerService(
      prisma as unknown as PrismaService,
      transits as unknown as AstroTransitService,
      settings as unknown as AstroSettingsService,
      events as unknown as EventEmitter2,
      NO_REDIS_CONFIG,
    );
  });

  it('выключенный сервис не запускает рассылку вовсе', async () => {
    settings.get.mockResolvedValue({
      enabled: false,
      transitPushEnabled: true,
    });
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);

    await worker.tick(NOW);

    expect(transits.today).not.toHaveBeenCalled();
  });

  it('без готовой фразы пуш не отправляется', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({ text: null, moonBhava: 3 });

    await worker.tick(NOW);

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('готовая фраза публикует самодостаточное событие', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({
      text: 'Хороший день для седьмого дома',
      moonBhava: 7,
    });

    await worker.tick(NOW);

    expect(events.emit).toHaveBeenCalledWith(
      'astro.transit.digest-ready',
      expect.objectContaining({
        name: 'astro.transit.digest-ready',
        recipientId: 'u1',
        excerpt: 'Хороший день для седьмого дома',
      }),
    );
  });

  it('глобально выключенные пуши не эмитят событие, но факты остаются', async () => {
    settings.get.mockResolvedValue({
      enabled: true,
      transitPushEnabled: false,
    });
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({ text: 'фраза', moonBhava: 1 });

    await worker.tick(NOW);

    expect(transits.today).toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('ошибка на одном пользователе не останавливает рассылку остальным', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([
      { userId: 'broken' },
      { userId: 'ok' },
    ]);
    transits.today
      .mockRejectedValueOnce(new Error('сбой'))
      .mockResolvedValueOnce({ text: 'фраза', moonBhava: 5 });

    await worker.tick(NOW);

    expect(transits.today).toHaveBeenCalledTimes(2);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('повторный вызов в те же сутки не запускает рассылку снова', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({ text: 'фраза', moonBhava: 2 });

    await worker.tick(NOW);
    await worker.tick(new Date(NOW.getTime() + 60_000));

    expect(prisma.astroBirthData.findMany).toHaveBeenCalledTimes(1);
  });

  it('следующие сутки запускают рассылку заново', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({ text: 'фраза', moonBhava: 2 });

    await worker.tick(NOW);
    await worker.tick(new Date('2026-08-11T03:00:00.000Z'));

    expect(prisma.astroBirthData.findMany).toHaveBeenCalledTimes(2);
  });

  it('отбор ограничен известным временем рождения и активностью за 14 дней', async () => {
    await worker.tick(NOW);

    const calls = prisma.astroBirthData.findMany.mock.calls as unknown as [
      { where: { timeAccuracy: { not: string }; OR: unknown[] } },
    ][];
    const [call] = calls;
    expect(call[0].where.timeAccuracy).toEqual({ not: 'unknown' });
    expect(call[0].where.OR).toHaveLength(2);
  });
});
