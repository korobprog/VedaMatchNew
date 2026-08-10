import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { VedicChart } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AstroChartService } from './astro-chart.service';
import { AstroGenerationService } from './astro-generation.service';
import { AstroQuotaService } from './astro-quota.service';
import { AstroReadingService } from './astro-reading.service';
import {
  ASTRO_SETTINGS_DEFAULTS,
  AstroSettingsService,
} from './astro-settings.service';

const NOW = new Date('2026-08-09T00:00:00.000Z');

const fullChart = {
  bornAtUtc: '1987-05-12T02:20:00.000Z',
  timeAccuracy: 'exact',
  ayanamsa: 23.669,
  lagna: { longitude: 46.19, rashi: 2, nakshatra: 4, pada: 1 },
  grahas: [],
  moonNakshatra: 15,
  dasha: {
    mahadashas: [],
    antardashas: [],
    currentMahadasha: { lord: 'saturn', startsAt: 'a', endsAt: 'b' },
    currentAntardasha: { lord: 'venus', startsAt: 'a', endsAt: 'b' },
  },
  fingerprint: 'fp-1',
  engineVersion: 'test',
} as unknown as VedicChart;

const timelessChart = {
  ...fullChart,
  timeAccuracy: 'unknown',
  lagna: null,
  dasha: null,
} as unknown as VedicChart;

describe('AstroReadingService', () => {
  const prisma = {
    astroReading: { findMany: jest.fn(), upsert: jest.fn() },
  };
  const charts = { chart: jest.fn() };
  const generation = { generate: jest.fn() };
  const quota = { state: jest.fn(), check: jest.fn(), record: jest.fn() };
  const settings = { get: jest.fn() };

  const service = new AstroReadingService(
    prisma as unknown as PrismaService,
    charts as unknown as AstroChartService,
    generation as unknown as AstroGenerationService,
    quota as unknown as AstroQuotaService,
    settings as unknown as AstroSettingsService,
  );

  const freeQuota = {
    readingsLeft: 3,
    readingsPerDay: 3,
    aiAvailable: true,
    budgetHalted: false,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    settings.get.mockResolvedValue({ ...ASTRO_SETTINGS_DEFAULTS });
    charts.chart.mockResolvedValue(fullChart);
    prisma.astroReading.findMany.mockResolvedValue([]);
    quota.state.mockResolvedValue(freeQuota);
    quota.check.mockResolvedValue({ allowed: true });
  });

  describe('список разделов', () => {
    it('перечисляет все разделы даже без единого сгенерированного', async () => {
      const result = await service.list('user-1', 'ru', NOW);
      expect(result.sections).toHaveLength(8);
      expect(result.sections.every((s) => s.text === null)).toBe(true);
    });

    it('подставляет тексты из кэша', async () => {
      prisma.astroReading.findMany.mockResolvedValue([
        { section: 'overview', text: 'Готовый разбор' },
      ]);
      const result = await service.list('user-1', 'ru', NOW);
      const overview = result.sections.find((s) => s.section === 'overview')!;
      expect(overview.text).toBe('Готовый разбор');
      expect(overview.available).toBe(true);
    });

    it('при неизвестном времени блокирует разделы, требующие лагну и даши', async () => {
      charts.chart.mockResolvedValue(timelessChart);
      const result = await service.list('user-1', 'ru', NOW);
      const byKey = new Map(result.sections.map((s) => [s.section, s]));

      expect(byKey.get('lagna')!.blockedBy).toBe('requires_data');
      expect(byKey.get('career')!.blockedBy).toBe('requires_data');
      expect(byKey.get('dasha_current')!.blockedBy).toBe('requires_data');
      // А то, чему хватает знаков грах, остаётся доступным.
      expect(byKey.get('overview')!.available).toBe(true);
      expect(byKey.get('strengths')!.available).toBe(true);
    });

    it('исчерпанная квота блокирует новые разделы', async () => {
      quota.state.mockResolvedValue({ ...freeQuota, readingsLeft: 0 });
      const result = await service.list('user-1', 'ru', NOW);
      expect(result.sections[0].blockedBy).toBe('quota_exhausted');
    });

    it('готовый текст остаётся доступен и при исчерпанной квоте', async () => {
      // Кэш ничего не стоит: ограничивать нужно появление новых текстов.
      quota.state.mockResolvedValue({ ...freeQuota, readingsLeft: 0 });
      prisma.astroReading.findMany.mockResolvedValue([
        { section: 'overview', text: 'Готовый разбор' },
      ]);
      const result = await service.list('user-1', 'ru', NOW);
      const overview = result.sections.find((s) => s.section === 'overview')!;
      expect(overview.available).toBe(true);
      expect(overview.blockedBy).toBeNull();
    });

    it('аварийная остановка помечает разделы как недоступные', async () => {
      quota.state.mockResolvedValue({
        ...freeQuota,
        aiAvailable: false,
        budgetHalted: true,
      });
      const result = await service.list('user-1', 'ru', NOW);
      expect(result.sections[0].blockedBy).toBe('ai_unavailable');
    });

    it('отключённый сервис не отдаёт разборы вовсе', async () => {
      settings.get.mockResolvedValue({
        ...ASTRO_SETTINGS_DEFAULTS,
        enabled: false,
      });
      await expect(service.list('user-1', 'ru', NOW)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('генерация', () => {
    beforeEach(() => {
      generation.generate.mockResolvedValue({
        text: 'Новый разбор',
        model: 'test-model',
        tokensIn: 900,
        tokensOut: 300,
      });
      prisma.astroReading.upsert.mockResolvedValue({});
    });

    it('обращается к провайдеру и сохраняет результат', async () => {
      const result = await service.generate('user-1', 'overview', 'ru', NOW);

      expect(generation.generate).toHaveBeenCalledWith(
        'overview',
        fullChart,
        'ru',
      );
      expect(prisma.astroReading.upsert).toHaveBeenCalled();
      expect(result.text).toBe('Новый разбор');
    });

    it('списывает фактически потраченные токены, а не запрошенные', async () => {
      await service.generate('user-1', 'overview', 'ru', NOW);
      expect(quota.record).toHaveBeenCalledWith(
        'user-1',
        { tokensIn: 900, tokensOut: 300 },
        NOW,
      );
    });

    it('готовый раздел берётся из кэша без обращения к провайдеру и без списания', async () => {
      prisma.astroReading.findMany.mockResolvedValue([
        { section: 'overview', text: 'Уже есть' },
      ]);

      const result = await service.generate('user-1', 'overview', 'ru', NOW);

      expect(result.text).toBe('Уже есть');
      expect(generation.generate).not.toHaveBeenCalled();
      expect(quota.record).not.toHaveBeenCalled();
      expect(quota.check).not.toHaveBeenCalled();
    });

    it('раздел без нужных данных не доходит до провайдера', async () => {
      charts.chart.mockResolvedValue(timelessChart);
      await expect(
        service.generate('user-1', 'lagna', 'ru', NOW),
      ).rejects.toThrow(/не хватает данных/);
      expect(generation.generate).not.toHaveBeenCalled();
    });

    it('исчерпанная квота не доходит до провайдера', async () => {
      quota.check.mockResolvedValue({
        allowed: false,
        reason: 'quota_exhausted',
      });
      await expect(
        service.generate('user-1', 'overview', 'ru', NOW),
      ).rejects.toThrow(ForbiddenException);
      expect(generation.generate).not.toHaveBeenCalled();
    });

    it('недоступный ИИ не доходит до провайдера', async () => {
      quota.check.mockResolvedValue({
        allowed: false,
        reason: 'ai_unavailable',
      });
      await expect(
        service.generate('user-1', 'overview', 'ru', NOW),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(generation.generate).not.toHaveBeenCalled();
    });

    it('расход не списывается, когда провайдер упал', async () => {
      generation.generate.mockRejectedValue(new Error('провайдер недоступен'));
      await expect(
        service.generate('user-1', 'overview', 'ru', NOW),
      ).rejects.toThrow('провайдер недоступен');
      expect(quota.record).not.toHaveBeenCalled();
      expect(prisma.astroReading.upsert).not.toHaveBeenCalled();
    });

    it('неизвестный раздел отклоняется', async () => {
      await expect(
        service.generate('user-1', 'nonsense' as never, 'ru', NOW),
      ).rejects.toThrow(/Неизвестный раздел/);
    });
  });
});
