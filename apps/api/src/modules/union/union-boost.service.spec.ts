import { PrismaService } from '../../prisma/prisma.service';
import { UnionBoostService } from './union-boost.service';
import { BOOST_DURATION_MS } from './union-limits';

const now = new Date('2026-08-07T10:00:00.000Z');

describe('UnionBoostService', () => {
  const prisma = {
    unionBoost: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const service = new UnionBoostService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('reports an inactive boost when there is none', async () => {
    prisma.unionBoost.findFirst.mockResolvedValue(null);

    await expect(service.status('user-1', now)).resolves.toEqual({
      active: false,
      expiresAt: null,
      secondsLeft: 0,
      durationMinutes: 40,
    });
  });

  it('counts the remaining seconds of an active boost', async () => {
    prisma.unionBoost.findFirst.mockResolvedValue({
      expiresAt: new Date(now.getTime() + 5 * 60_000),
    });

    await expect(service.status('user-1', now)).resolves.toEqual(
      expect.objectContaining({ active: true, secondsLeft: 300 }),
    );
  });

  it('activates a boost for the configured duration', async () => {
    prisma.unionBoost.findFirst.mockResolvedValue(null);
    const expiresAt = new Date(now.getTime() + BOOST_DURATION_MS);
    prisma.unionBoost.create.mockResolvedValue({ expiresAt });

    await expect(service.activate('user-1', now)).resolves.toEqual(
      expect.objectContaining({
        active: true,
        expiresAt: expiresAt.toISOString(),
      }),
    );
    expect(prisma.unionBoost.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', startedAt: now, expiresAt },
    });
  });

  it('refuses to stack a second boost on an active one', async () => {
    prisma.unionBoost.findFirst.mockResolvedValue({
      expiresAt: new Date(now.getTime() + 60_000),
    });

    await expect(service.activate('user-1', now)).rejects.toThrow(
      'Внимание уже активно',
    );
    expect(prisma.unionBoost.create).not.toHaveBeenCalled();
  });

  it('lists everyone whose boost is still running', async () => {
    prisma.unionBoost.findMany.mockResolvedValue([
      { userId: 'user-2' },
      { userId: 'user-3' },
    ]);

    await expect(service.boostedUserIds(now)).resolves.toEqual(
      new Set(['user-2', 'user-3']),
    );
    expect(prisma.unionBoost.findMany).toHaveBeenCalledWith({
      where: { expiresAt: { gt: now } },
      select: { userId: true },
    });
  });
});
