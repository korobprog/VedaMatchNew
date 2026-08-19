import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok when SELECT 1 succeeds', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new HealthController(prisma as never);
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'ok',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns 503 with db=down when the database is unreachable', async () => {
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
    });
  });
});
