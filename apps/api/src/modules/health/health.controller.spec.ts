import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller';

const SHA = '187ea796f8dfc11288394759c1cf72e402ff1121';

describe('HealthController', () => {
  const original = process.env.GIT_SHA;
  afterEach(() => {
    if (original === undefined) delete process.env.GIT_SHA;
    else process.env.GIT_SHA = original;
  });

  it('reports ok when SELECT 1 succeeds', async () => {
    delete process.env.GIT_SHA;
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new HealthController(prisma as never);
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'ok',
      commit: null,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  // По этому полю CI отличает новый образ от старого: «ok» отвечают оба.
  it('names the commit the image was built from', async () => {
    process.env.GIT_SHA = SHA;
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const controller = new HealthController(prisma as never);
    await expect(controller.check()).resolves.toMatchObject({ commit: SHA });
  });

  it('returns 503 with db=down when the database is unreachable', async () => {
    process.env.GIT_SHA = SHA;
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const controller = new HealthController(prisma as never);
    const error = await controller.check().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect((error as HttpException).getResponse()).toEqual({
      status: 'error',
      db: 'down',
      commit: SHA,
    });
  });
});
