import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AstroSettingsService } from '../astro-settings.service';
import { AstroTransitService } from './astro-transit.service';
import { AstroTransitWorkerService } from './astro-transit-worker.service';

// 06:00 UTC — это 09:00 МСК, задуманное время рассылки.
const NOW = new Date('2026-08-10T06:00:00.000Z');
const NO_REDIS_CONFIG = { get: () => undefined } as unknown as ConfigService;

describe('AstroTransitWorkerService', () => {
  const prisma = {
    astroBirthData: { findMany: jest.fn() },
    astroTransitDigest: { updateMany: jest.fn(), findUnique: jest.fn() },
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

  it('повторный вызов в тот же час не сканирует получателей снова', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({ text: 'фраза', moonBhava: 2 });

    await worker.tick(NOW);
    await worker.tick(new Date(NOW.getTime() + 60_000));

    expect(prisma.astroBirthData.findMany).toHaveBeenCalledTimes(1);
  });

  it('следующий час сканирует заново: у кого-то утро наступило только что', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({ text: 'фраза', moonBhava: 2 });

    await worker.tick(NOW);
    await worker.tick(new Date(NOW.getTime() + 60 * 60_000));

    expect(prisma.astroBirthData.findMany).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['до окна', '2026-08-10T02:59:00.000Z'],
    ['после окна', '2026-08-10T09:00:00.000Z'],
  ])('вне московского окна (%s) без пояса ничего не шлём', async (_case, iso) => {
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({ text: 'фраза', moonBhava: 2 });

    await worker.tick(new Date(iso));

    expect(transits.today).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  /**
   * Ради чего переделывался обход: человеку во Владивостоке утро — это
   * 23:00 UTC накануне, а не 06:00 UTC, когда у него уже вечер.
   */
  it('шлёт по местному утру человека, а не по московскому', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([
      { userId: 'vladivostok', user: { timeZone: 'Asia/Vladivostok' } },
      { userId: 'moscow', user: { timeZone: 'Europe/Moscow' } },
      { userId: 'legacy', user: { timeZone: null } },
    ]);
    transits.today.mockResolvedValue({ text: 'фраза', moonBhava: 2 });

    // 06:00 UTC: утро в Москве и у человека без пояса, вечер во Владивостоке.
    await worker.tick(NOW);
    const morningInMoscow = events.emit.mock.calls.map(
      (call) => (call[1] as { recipientId: string }).recipientId,
    );
    expect(morningInMoscow.sort()).toEqual(['legacy', 'moscow']);

    events.emit.mockClear();
    // 23:00 UTC: утро во Владивостоке, ночь в Москве.
    await worker.tick(new Date('2026-08-10T23:00:00.000Z'));
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit.mock.calls[0][1]).toMatchObject({
      recipientId: 'vladivostok',
    });
  });

  it('второй обход в том же окне не пересчитывает уже отправленный день', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    prisma.astroTransitDigest.findUnique.mockResolvedValue({
      pushedAt: new Date(NOW.getTime() - 30 * 60_000),
    });

    await worker.tick(new Date(NOW.getTime() + 60 * 60_000));

    expect(transits.today).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  /**
   * Главный регресс: деплой поднимает процесс с чистым lastRunDate, и раньше
   * это означало повторный пуш всем, кто уже получил его сегодня.
   */
  it('рестарт внутри окна не шлёт пуш повторно уже получившим', async () => {
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({ text: 'фраза', moonBhava: 2 });
    // Строка дня уже занята утренней рассылкой: pushedAt не null.
    prisma.astroTransitDigest.updateMany.mockResolvedValue({ count: 0 });

    const afterRestart = new AstroTransitWorkerService(
      prisma as unknown as PrismaService,
      transits as unknown as AstroTransitService,
      settings as unknown as AstroSettingsService,
      events as unknown as EventEmitter2,
      NO_REDIS_CONFIG,
    );
    await afterRestart.tick(new Date(NOW.getTime() + 20 * 60_000));

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('строка дня занимается до отправки, а не после', async () => {
    const order: string[] = [];
    prisma.astroBirthData.findMany.mockResolvedValue([{ userId: 'u1' }]);
    transits.today.mockResolvedValue({ text: 'фраза', moonBhava: 2 });
    prisma.astroTransitDigest.updateMany.mockImplementation(() => {
      order.push('claim');
      return Promise.resolve({ count: 1 });
    });
    events.emit.mockImplementation(() => {
      order.push('emit');
      return true;
    });

    await worker.tick(NOW);

    expect(order).toEqual(['claim', 'emit']);
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
