import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AstroAdminService } from './astro-admin.service';
import { AstroQuotaService } from './astro-quota.service';
import {
  ASTRO_SETTINGS_DEFAULTS,
  AstroSettingsService,
} from './astro-settings.service';

const NOW = new Date('2026-08-09T12:00:00.000Z');

describe('AstroAdminService', () => {
  const prisma = {
    astroBudgetDay: { findMany: jest.fn() },
    astroUsage: { groupBy: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const settings = { get: jest.fn(), update: jest.fn() };
  const quota = { resume: jest.fn() };
  const service = new AstroAdminService(
    prisma as unknown as PrismaService,
    settings as unknown as AstroSettingsService,
    quota as unknown as AstroQuotaService,
  );

  /** Аргументы запроса истории. Типы мока теряются, поэтому форма объявлена явно. */
  const findManyArgs = () => {
    const calls = prisma.astroBudgetDay.findMany.mock.calls as unknown as [
      { where: { day: { gte: Date } } },
    ][];
    return calls[0][0];
  };

  beforeEach(() => {
    jest.resetAllMocks();
    settings.get.mockResolvedValue({ ...ASTRO_SETTINGS_DEFAULTS });
    settings.update.mockImplementation((patch: object) =>
      Promise.resolve({ ...ASTRO_SETTINGS_DEFAULTS, ...patch }),
    );
    prisma.astroBudgetDay.findMany.mockResolvedValue([]);
    prisma.astroUsage.groupBy.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
  });

  describe('правка лимитов', () => {
    it('сохраняет допустимые значения', async () => {
      await service.updateSettings({ dailyReadingsPerUser: 10 });
      expect(settings.update).toHaveBeenCalledWith({
        dailyReadingsPerUser: 10,
      });
    });

    it('пропускает только переданные поля', async () => {
      await service.updateSettings({ aiEnabled: false });
      expect(settings.update).toHaveBeenCalledWith({ aiEnabled: false });
    });

    // Границы защищают от опечатки: лишний ноль в бюджете стоит реальных денег,
    // и заметить его постфактум трудно.
    it('отклоняет отрицательные лимиты', async () => {
      await expect(
        service.updateSettings({ dailyReadingsPerUser: -1 }),
      ).rejects.toThrow(BadRequestException);
      expect(settings.update).not.toHaveBeenCalled();
    });

    it('отклоняет неправдоподобно большой бюджет', async () => {
      await expect(
        service.updateSettings({ dailyTokenBudget: 99_000_000_000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('отклоняет дробные значения', async () => {
      await expect(
        service.updateSettings({ dailyReadingsPerUser: 2.5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('отклоняет строку вместо числа', async () => {
      await expect(
        service.updateSettings({ dailyTokensPerUser: '1000' as never }),
      ).rejects.toThrow(BadRequestException);
    });

    it('отклоняет не логическое значение у переключателя', async () => {
      await expect(
        service.updateSettings({ aiEnabled: 'yes' as never }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ноль разрешён: это осмысленное «запретить полностью»', async () => {
      await service.updateSettings({ dailyReadingsPerUser: 0 });
      expect(settings.update).toHaveBeenCalledWith({ dailyReadingsPerUser: 0 });
    });
  });

  describe('сводка расхода', () => {
    it('пустая история не ломает ответ', async () => {
      const usage = await service.usage(30, NOW);
      expect(usage.days).toEqual([]);
      expect(usage.today).toEqual({
        tokensIn: 0,
        tokensOut: 0,
        costUsdCents: 0,
        halted: false,
      });
    });

    it('выделяет сегодняшний день из истории', async () => {
      prisma.astroBudgetDay.findMany.mockResolvedValue([
        {
          day: new Date('2026-08-09T00:00:00.000Z'),
          tokensIn: 1000,
          tokensOut: 500,
          costUsdCents: 12,
          haltedAt: new Date(),
        },
        {
          day: new Date('2026-08-08T00:00:00.000Z'),
          tokensIn: 10,
          tokensOut: 5,
          costUsdCents: 1,
          haltedAt: null,
        },
      ]);

      const usage = await service.usage(30, NOW);

      expect(usage.today).toEqual({
        tokensIn: 1000,
        tokensOut: 500,
        costUsdCents: 12,
        halted: true,
      });
      expect(usage.days[0].day).toBe('2026-08-09');
      expect(usage.days[1].halted).toBe(false);
    });

    it('подставляет имена к топу потребителей', async () => {
      prisma.astroUsage.groupBy.mockResolvedValue([
        {
          userId: 'user-1',
          _sum: { readings: 5, tokensIn: 4000, tokensOut: 1000 },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', name: 'Иван', email: 'ivan@example.com' },
      ]);

      const usage = await service.usage(30, NOW);

      expect(usage.topConsumers[0]).toEqual({
        userId: 'user-1',
        name: 'Иван',
        email: 'ivan@example.com',
        readings: 5,
        tokens: 5000,
      });
    });

    it('удалённый пользователь не роняет сводку', async () => {
      prisma.astroUsage.groupBy.mockResolvedValue([
        { userId: 'ghost', _sum: { readings: 1, tokensIn: 1, tokensOut: 1 } },
      ]);
      const usage = await service.usage(30, NOW);
      expect(usage.topConsumers[0].name).toBe('—');
    });

    it('ограничивает окно истории сверху', async () => {
      await service.usage(9999, NOW);
      const where = findManyArgs();
      const from = where.where.day.gte;
      const days = Math.round(
        (Date.UTC(2026, 7, 9) - from.getTime()) / (24 * 60 * 60 * 1000),
      );
      expect(days).toBe(89);
    });

    it('окно не может быть нулевым или отрицательным', async () => {
      await service.usage(0, NOW);
      const where = findManyArgs();
      expect(where.where.day.gte.getTime()).toBe(Date.UTC(2026, 7, 9));
    });
  });

  it('снятие остановки вызывает сброс и возвращает свежую сводку', async () => {
    const usage = await service.resume(NOW);
    expect(quota.resume).toHaveBeenCalledWith(NOW);
    expect(usage.today.halted).toBe(false);
  });
});
