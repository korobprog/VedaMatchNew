import { ConfigService } from '@nestjs/config';
import { MotivationWorkerService } from './motivation-worker.service';

describe('MotivationWorkerService', () => {
  it('requeues failed and interrupted jobs from today on startup', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = { motivationPost: { updateMany } };
    const generation = {};
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const worker = new MotivationWorkerService(prisma as never, generation as never, config);

    await (worker as unknown as { retryTodaysFailedJobs(): Promise<void> }).retryTodaysFailedJobs();

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { not: 'published' } }),
      data: expect.objectContaining({ status: 'draft', generationStage: 'queued', attemptCount: 0 }),
    }));
  });

  it('only recovers generation jobs stale for at least five minutes', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = { motivationPost: { updateMany } };
    const generation = {};
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const before = Date.now();
    const worker = new MotivationWorkerService(prisma as never, generation as never, config);

    await (worker as unknown as { recoverExpiredJobs(): Promise<void> }).recoverExpiredJobs();

    const expiredAt = updateMany.mock.calls[0][0].where.updatedAt.lt as Date;
    expect(expiredAt.getTime()).toBeGreaterThanOrEqual(before - 5 * 60_000 - 100);
    expect(expiredAt.getTime()).toBeLessThanOrEqual(Date.now() - 5 * 60_000 + 100);
  });
});
