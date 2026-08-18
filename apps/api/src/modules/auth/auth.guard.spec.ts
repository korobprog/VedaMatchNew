import type { ExecutionContext } from '@nestjs/common';

// jose — ESM-only, ts-jest его не транспилирует; verifyAccessToken мокается.
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import { AuthGuard } from './auth.guard';

function context(cookies: Record<string, string>) {
  const req = { headers: {}, cookies, user: undefined as unknown };
  return {
    req,
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
  };
}

describe('AuthGuard', () => {
  it('роль берётся из базы, а не из токена', async () => {
    const jwt = {
      verifyAccessToken: jest
        .fn()
        .mockResolvedValue({ sub: 'u1', email: 'a@b.c', role: 'admin' }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          role: 'user', // разжалован после выдачи токена
          accountStatus: 'active',
          pendingDeletionAt: null,
          blockedUntil: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const guard = new AuthGuard(jwt as never, prisma as never);
    const { req, ctx } = context({ access_token: 't' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((req.user as { role: string }).role).toBe('user');
  });
});
