import { PrismaService } from '../../../prisma/prisma.service';
import { AstroGenerationService } from '../astro-generation.service';
import { AstroQuotaService } from '../astro-quota.service';
import { AstronomiaEphemerisProvider } from '../ephemeris/astronomia-provider';
import { AstroTransitService } from './astro-transit.service';

const NOW = new Date('2026-08-10T12:00:00.000Z');

const birthRow = {
  bornAtUtc: new Date('1987-05-12T02:20:00.000Z'),
  latitude: 55.7558,
  longitude: 37.6173,
  timeAccuracy: 'exact' as const,
};

describe('AstroTransitService', () => {
  const prisma = {
    astroBirthData: { findUnique: jest.fn() },
    astroTransitDigest: { upsert: jest.fn() },
    astroTransitPhrase: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const generation = { generateTransitPhrase: jest.fn() };
  const quota = { aiAvailable: jest.fn(), recordSystemUsage: jest.fn() };

  const service = new AstroTransitService(
    prisma as unknown as PrismaService,
    new AstronomiaEphemerisProvider(),
    generation as unknown as AstroGenerationService,
    quota as unknown as AstroQuotaService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.astroTransitDigest.upsert.mockResolvedValue({});
    quota.aiAvailable.mockResolvedValue(true);
  });

  it('без данных рождения возвращает null', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(null);
    await expect(service.today('user-1', NOW)).resolves.toBeNull();
  });

  it('при неизвестном времени возвращает null — бхавы без лагны не бывает', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue({
      ...birthRow,
      timeAccuracy: 'unknown',
    });
    await expect(service.today('user-1', NOW)).resolves.toBeNull();
  });

  it('генерирует фразу, когда кэша ещё нет, и сохраняет её', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(birthRow);
    prisma.astroTransitPhrase.findUnique.mockResolvedValue(null);
    generation.generateTransitPhrase.mockResolvedValue({
      text: 'Сегодня хороший день для дел седьмого дома',
      model: 'test',
      tokensIn: 40,
      tokensOut: 20,
    });

    const digest = await service.today('user-1', NOW);

    expect(digest).not.toBeNull();
    expect(digest!.text).toBe('Сегодня хороший день для дел седьмого дома');
    expect(digest!.moonBhava).toBeGreaterThanOrEqual(1);
    expect(digest!.moonBhava).toBeLessThanOrEqual(12);
    expect(prisma.astroTransitPhrase.upsert).toHaveBeenCalled();
    expect(quota.recordSystemUsage).toHaveBeenCalledWith(
      { tokensIn: 40, tokensOut: 20 },
      NOW,
    );
  });

  it('готовую фразу берёт из кэша, не обращаясь к провайдеру', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(birthRow);
    prisma.astroTransitPhrase.findUnique.mockResolvedValue({
      text: 'Уже готовая фраза',
    });

    const digest = await service.today('user-1', NOW);

    expect(digest!.text).toBe('Уже готовая фраза');
    expect(generation.generateTransitPhrase).not.toHaveBeenCalled();
    expect(quota.recordSystemUsage).not.toHaveBeenCalled();
  });

  it('при выключенном ИИ факты остаются, фраза — null, без обращения к провайдеру', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(birthRow);
    prisma.astroTransitPhrase.findUnique.mockResolvedValue(null);
    quota.aiAvailable.mockResolvedValue(false);

    const digest = await service.today('user-1', NOW);

    expect(digest).not.toBeNull();
    expect(digest!.text).toBeNull();
    expect(digest!.moonRashi).toBeGreaterThanOrEqual(1);
    expect(generation.generateTransitPhrase).not.toHaveBeenCalled();
  });

  it('ошибка провайдера не роняет весь дайджест и не портит кэш', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(birthRow);
    prisma.astroTransitPhrase.findUnique.mockResolvedValue(null);
    generation.generateTransitPhrase.mockRejectedValue(new Error('недоступен'));

    const digest = await service.today('user-1', NOW);

    expect(digest).not.toBeNull();
    expect(digest!.text).toBeNull();
    expect(prisma.astroTransitPhrase.upsert).not.toHaveBeenCalled();
  });

  it('сохраняет дайджест в базу даже без фразы', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(birthRow);
    prisma.astroTransitPhrase.findUnique.mockResolvedValue(null);
    quota.aiAvailable.mockResolvedValue(false);

    await service.today('user-1', NOW);

    expect(prisma.astroTransitDigest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_forDate: {
            userId: 'user-1',
            forDate: new Date('2026-08-10T00:00:00.000Z'),
          },
        },
      }),
    );
  });

  it('текущая даша совпадает с тем, что показывает карта', async () => {
    prisma.astroBirthData.findUnique.mockResolvedValue(birthRow);
    prisma.astroTransitPhrase.findUnique.mockResolvedValue({ text: 'x' });

    const digest = await service.today('user-1', NOW);

    expect(digest!.currentMahadasha.lord).toBeDefined();
    expect(digest!.currentAntardasha.lord).toBeDefined();
  });
});
