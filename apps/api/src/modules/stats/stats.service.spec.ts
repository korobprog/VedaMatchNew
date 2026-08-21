import { PrismaService } from '../../prisma/prisma.service';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  const prisma = {
    user: { count: jest.fn() },
    community: { count: jest.fn() },
    // Города считаются сырым запросом: Prisma не группирует по ключу в Json.
    $queryRaw: jest.fn(),
  };
  let service: StatsService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T00:00:00.000Z'));
    prisma.user.count.mockResolvedValue(42);
    prisma.community.count.mockResolvedValue(3);
    prisma.$queryRaw.mockResolvedValue([
      { city: 'Москва', count: 5n },
      { city: 'Рига', count: 2n },
    ]);
    service = new StatsService(prisma as unknown as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  it('запрашивает счётчик пользователей у Prisma', async () => {
    const result = await service.communityStats();

    expect(result).toEqual({
      totalMembers: 42,
      totalCities: 2,
      totalCommunities: 3,
    });
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
  });

  it('отдаёт закэшированное значение повторным вызовам в течение 5 минут', async () => {
    await service.communityStats();
    prisma.user.count.mockResolvedValue(99);

    const result = await service.communityStats();

    expect(result).toEqual({
      totalMembers: 42,
      totalCities: 2,
      totalCommunities: 3,
    });
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
  });

  it('перезапрашивает счётчик после истечения TTL', async () => {
    await service.communityStats();
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    prisma.user.count.mockResolvedValue(99);

    const result = await service.communityStats();

    expect(result).toEqual({
      totalMembers: 99,
      totalCities: 2,
      totalCommunities: 3,
    });
    expect(prisma.user.count).toHaveBeenCalledTimes(2);
  });
});
