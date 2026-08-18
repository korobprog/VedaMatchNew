import { UnauthorizedException } from '@nestjs/common';

// openid-client и jose — ESM-only, ts-jest их не транспилирует; в этих
// тестах Google-поток не нужен, поэтому модули заменяются пустышками.
jest.mock('openid-client', () => ({}));
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import { AuthService } from './auth.service';

/**
 * refresh: ротация как CAS и reuse-detection. Google/OIDC здесь не трогаем.
 */
function makeService(stored: Record<string, unknown> | null, rotatedCount = 1) {
  const prisma = {
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue(stored),
      updateMany: jest.fn().mockResolvedValue({ count: rotatedCount }),
      create: jest.fn().mockResolvedValue({}),
    },
    user: { update: jest.fn() },
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => fallback),
  };
  const jwt = { signAccessToken: jest.fn().mockResolvedValue('access') };
  const service = new AuthService(
    config as never,
    prisma as never,
    jwt as never,
  );
  const res = { cookie: jest.fn() };
  const req = { cookies: { refresh_token: 'raw-token' } };
  return { service, prisma, req, res };
}

const activeUser = {
  id: 'u1',
  email: 'a@b.c',
  role: 'user',
  accountStatus: 'active',
  pendingDeletionAt: null,
  blockedUntil: null,
};

describe('AuthService.refresh', () => {
  it('ротирует токен условием revoked=false и выдаёт новую пару', async () => {
    const { service, prisma, req, res } = makeService({
      id: 'rt1',
      userId: 'u1',
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    await expect(service.refresh(req as never, res as never)).resolves.toEqual({
      ok: true,
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt1', revoked: false },
      data: { revoked: true },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledTimes(2);
  });

  it('проигравший гонку параллельный refresh получает 401 без новой пары', async () => {
    const { service, prisma, req, res } = makeService(
      {
        id: 'rt1',
        userId: 'u1',
        revoked: false,
        expiresAt: new Date(Date.now() + 60_000),
        user: activeUser,
      },
      0,
    );
    await expect(
      service.refresh(req as never, res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('повторное предъявление отозванного токена отзывает все токены пользователя', async () => {
    const { service, prisma, req, res } = makeService({
      id: 'rt1',
      userId: 'u1',
      revoked: true,
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    await expect(
      service.refresh(req as never, res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revoked: false },
      data: { revoked: true },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('access-cookie живёт столько же, сколько ACCESS_TOKEN_TTL', async () => {
    const { service, req, res } = makeService({
      id: 'rt1',
      userId: 'u1',
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    (service as unknown as { config: { get: jest.Mock } }).config.get = jest.fn(
      (key: string, fallback?: string) =>
        key === 'ACCESS_TOKEN_TTL' ? '1h' : fallback,
    );
    await service.refresh(req as never, res as never);
    const accessCookie = res.cookie.mock.calls.find(
      (call: unknown[]) => call[0] === 'access_token',
    ) as [string, string, { maxAge: number }];
    expect(accessCookie[2].maxAge).toBe(60 * 60 * 1000);
  });
});
