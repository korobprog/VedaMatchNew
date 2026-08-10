import { PrismaService } from '../../prisma/prisma.service';
import { AstroQuotaService, usageDay } from './astro-quota.service';
import {
  ASTRO_SETTINGS_DEFAULTS,
  AstroSettingsService,
  type AstroSettingsValues,
} from './astro-settings.service';

const NOW = new Date('2026-08-09T15:30:00.000Z');

describe('usageDay', () => {
  it('срезает время до календарного дня в UTC', () => {
    expect(usageDay(NOW).toISOString()).toBe('2026-08-09T00:00:00.000Z');
  });

  it('поздний вечер и раннее утро одних суток дают один ключ', () => {
    expect(usageDay(new Date('2026-08-09T23:59:00Z')).getTime()).toBe(
      usageDay(new Date('2026-08-09T00:01:00Z')).getTime(),
    );
  });
});

describe('AstroQuotaService', () => {
  const prisma = {
    astroUsage: { findUnique: jest.fn(), upsert: jest.fn() },
    astroBudgetDay: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const settings = { get: jest.fn() };
  const service = new AstroQuotaService(
    prisma as unknown as PrismaService,
    settings as unknown as AstroSettingsService,
  );

  const withSettings = (patch: Partial<AstroSettingsValues> = {}) =>
    settings.get.mockResolvedValue({ ...ASTRO_SETTINGS_DEFAULTS, ...patch });

  beforeEach(() => {
    jest.resetAllMocks();
    withSettings();
    prisma.astroUsage.findUnique.mockResolvedValue(null);
    prisma.astroBudgetDay.findUnique.mockResolvedValue(null);
  });

  describe('состояние', () => {
    it('у нового пользователя доступна полная квота', async () => {
      await expect(service.state('user-1', NOW)).resolves.toEqual({
        readingsLeft: 3,
        readingsPerDay: 3,
        aiAvailable: true,
        budgetHalted: false,
      });
    });

    it('вычитает уже потраченные разборы', async () => {
      prisma.astroUsage.findUnique.mockResolvedValue({
        readings: 2,
        tokensIn: 100,
        tokensOut: 100,
      });
      const state = await service.state('user-1', NOW);
      expect(state.readingsLeft).toBe(1);
    });

    it('не уходит в минус при превышении', async () => {
      prisma.astroUsage.findUnique.mockResolvedValue({
        readings: 9,
        tokensIn: 0,
        tokensOut: 0,
      });
      await expect(service.state('user-1', NOW)).resolves.toMatchObject({
        readingsLeft: 0,
      });
    });

    it('аварийный выключатель гасит ИИ, не трогая квоту', async () => {
      withSettings({ aiEnabled: false });
      const state = await service.state('user-1', NOW);
      expect(state.aiAvailable).toBe(false);
      expect(state.readingsLeft).toBe(3);
    });
  });

  describe('проверка перед вызовом провайдера', () => {
    it('пропускает, когда лимиты не выбраны', async () => {
      await expect(service.check('user-1', NOW)).resolves.toEqual({
        allowed: true,
      });
    });

    it('отказывает при исчерпанной квоте разборов', async () => {
      prisma.astroUsage.findUnique.mockResolvedValue({
        readings: 3,
        tokensIn: 0,
        tokensOut: 0,
      });
      await expect(service.check('user-1', NOW)).resolves.toEqual({
        allowed: false,
        reason: 'quota_exhausted',
      });
    });

    it('отказывает при исчерпанном лимите токенов пользователя', async () => {
      prisma.astroUsage.findUnique.mockResolvedValue({
        readings: 0,
        tokensIn: 15_000,
        tokensOut: 5_000,
      });
      await expect(service.check('user-1', NOW)).resolves.toEqual({
        allowed: false,
        reason: 'quota_exhausted',
      });
    });

    it('отказывает при выключенном ИИ, не обращаясь к базе', async () => {
      withSettings({ aiEnabled: false });
      await expect(service.check('user-1', NOW)).resolves.toEqual({
        allowed: false,
        reason: 'ai_unavailable',
      });
      expect(prisma.astroUsage.findUnique).not.toHaveBeenCalled();
    });

    it('отказывает после аварийной остановки бюджета', async () => {
      prisma.astroBudgetDay.findUnique.mockResolvedValue({
        haltedAt: NOW,
        tokensIn: 0,
        tokensOut: 0,
        costUsdCents: 0,
      });
      await expect(service.check('user-1', NOW)).resolves.toEqual({
        allowed: false,
        reason: 'ai_unavailable',
      });
    });

    it('отказывает при превышении общего лимита токенов, даже без отметки остановки', async () => {
      prisma.astroBudgetDay.findUnique.mockResolvedValue({
        haltedAt: null,
        tokensIn: 1_500_000,
        tokensOut: 600_000,
        costUsdCents: 0,
      });
      await expect(service.check('user-1', NOW)).resolves.toMatchObject({
        allowed: false,
        reason: 'ai_unavailable',
      });
    });
  });

  describe('запись расхода', () => {
    beforeEach(() => {
      prisma.astroBudgetDay.upsert.mockResolvedValue({
        haltedAt: null,
        tokensIn: 100,
        tokensOut: 50,
        costUsdCents: 0,
      });
    });

    it('увеличивает счётчики пользователя и общий бюджет', async () => {
      await service.record('user-1', { tokensIn: 100, tokensOut: 50 }, NOW);

      expect(prisma.astroUsage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            readings: { increment: 1 },
            tokensIn: { increment: 100 },
            tokensOut: { increment: 50 },
          },
        }),
      );
      expect(prisma.astroBudgetDay.upsert).toHaveBeenCalled();
    });

    it('ставит аварийную остановку, когда бюджет перебран', async () => {
      prisma.astroBudgetDay.upsert.mockResolvedValue({
        haltedAt: null,
        tokensIn: 2_000_000,
        tokensOut: 1_000,
        costUsdCents: 0,
      });

      await service.record('user-1', { tokensIn: 10, tokensOut: 10 }, NOW);

      expect(prisma.astroBudgetDay.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { haltedAt: NOW } }),
      );
    });

    it('не переставляет отметку остановки повторно', async () => {
      prisma.astroBudgetDay.upsert.mockResolvedValue({
        haltedAt: new Date('2026-08-09T10:00:00Z'),
        tokensIn: 3_000_000,
        tokensOut: 0,
        costUsdCents: 0,
      });

      await service.record('user-1', { tokensIn: 10, tokensOut: 10 }, NOW);

      expect(prisma.astroBudgetDay.update).not.toHaveBeenCalled();
    });
  });

  it('снятие остановки очищает отметку за сегодня', async () => {
    await service.resume(NOW);
    expect(prisma.astroBudgetDay.updateMany).toHaveBeenCalledWith({
      where: { day: usageDay(NOW) },
      data: { haltedAt: null },
    });
  });
});
