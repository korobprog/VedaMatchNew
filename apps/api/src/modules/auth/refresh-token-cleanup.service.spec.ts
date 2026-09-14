import {
  APP_LOGIN_CODE_RETENTION_MS,
  REVOKED_RETENTION_MS,
  RefreshTokenCleanupService,
} from './refresh-token-cleanup.service';

describe('RefreshTokenCleanupService', () => {
  it('удаляет протухшие и давно отозванные токены', async () => {
    const prisma = {
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      appLoginCode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
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

  it('удаляет коды входа приложения через час после истечения', async () => {
    const prisma = {
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      appLoginCode: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const service = new RefreshTokenCleanupService(prisma as never);
    const now = new Date('2026-09-14T12:00:00Z');
    await service.tick(now);
    expect(prisma.appLoginCode.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: {
          lt: new Date(now.getTime() - APP_LOGIN_CODE_RETENTION_MS),
        },
      },
    });
  });

  it('сбой чистки кодов не мешает чистке токенов', async () => {
    const prisma = {
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
      appLoginCode: {
        deleteMany: jest.fn().mockRejectedValue(new Error('db')),
      },
    };
    const service = new RefreshTokenCleanupService(prisma as never);
    await expect(service.tick()).resolves.toBe(4);
  });
});
