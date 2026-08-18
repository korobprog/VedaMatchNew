import {
  REVOKED_RETENTION_MS,
  RefreshTokenCleanupService,
} from './refresh-token-cleanup.service';

describe('RefreshTokenCleanupService', () => {
  it('удаляет протухшие и давно отозванные токены', async () => {
    const prisma = {
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    const service = new RefreshTokenCleanupService(prisma as never);
    const now = new Date('2026-08-19T12:00:00Z');
    await expect(service.tick(now)).resolves.toBe(3);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          {
            revoked: true,
            createdAt: { lt: new Date(now.getTime() - REVOKED_RETENTION_MS) },
          },
        ],
      },
    });
  });

  it('ошибка базы не роняет тик', async () => {
    const prisma = {
      refreshToken: {
        deleteMany: jest.fn().mockRejectedValue(new Error('db')),
      },
    };
    const service = new RefreshTokenCleanupService(prisma as never);
    await expect(service.tick()).resolves.toBe(0);
  });
});
