import type { ExecutionContext } from '@nestjs/common';

// jose — ESM-only, ts-jest его не транспилирует; verifyAccessToken мокается.
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import { AuthGuard } from './auth.guard';

function context(
  cookies: Record<string, string>,
  extra: {
    headers?: Record<string, string>;
    method?: string;
    path?: string;
  } = {},
) {
  const req = {
    headers: extra.headers ?? {},
    cookies,
    method: extra.method ?? 'GET',
    path: extra.path ?? '/work/spaces',
    user: undefined as unknown,
  };
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
    const guard = new AuthGuard(
      jwt as never,
      prisma as never,
      {
        resolve: jest.fn(),
      } as never,
    );
    const { req, ctx } = context({ access_token: 't' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((req.user as { role: string }).role).toBe('user');
  });

  it('персональный ключ пускает под своим владельцем', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u9',
          email: 'key@owner',
          role: 'user',
          accountStatus: 'active',
          pendingDeletionAt: null,
          blockedUntil: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const apiKeys = {
      resolve: jest.fn().mockResolvedValue({
        ok: true,
        userId: 'u9',
        scopes: ['work:read'],
      }),
    };
    const guard = new AuthGuard({} as never, prisma as never, apiKeys as never);
    const { req, ctx } = context(
      {},
      { headers: { authorization: 'Bearer vm_secret' } },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const user = req.user as { sub: string; apiScopes: string[] };
    expect(user.sub).toBe('u9');
    expect(user.apiScopes).toEqual(['work:read']);
    // Ключ проверяется вместе с методом и путём: право режется по сервису.
    expect(apiKeys.resolve).toHaveBeenCalledWith(
      'vm_secret',
      'GET',
      '/work/spaces',
    );
  });

  it('живому ключу без права объясняют, какого права нет', async () => {
    const apiKeys = {
      resolve: jest
        .fn()
        .mockResolvedValue({
          ok: false,
          reason: 'forbidden',
          scopes: ['work:read'],
        }),
    };
    const guard = new AuthGuard({} as never, {} as never, apiKeys as never);
    const { ctx } = context(
      {},
      {
        headers: { authorization: 'Bearer vm_secret' },
        method: 'POST',
        path: '/work/tasks',
      },
    );

    // Не «ключ недействителен»: он действителен, и выпускать новый незачем —
    // нужно дописать право.
    await expect(guard.canActivate(ctx)).rejects.toThrow(/не хватает права/);
    await expect(guard.canActivate(ctx)).rejects.toThrow(/work:read/);
  });

  it('отозванный ключ — это именно недействительный ключ', async () => {
    const apiKeys = {
      resolve: jest.fn().mockResolvedValue({ ok: false, reason: 'unusable' }),
    };
    const guard = new AuthGuard({} as never, {} as never, apiKeys as never);
    const { ctx } = context({}, { headers: { authorization: 'Bearer vm_x' } });

    await expect(guard.canActivate(ctx)).rejects.toThrow(/недействителен/);
  });

  it('ключ не проверяется как JWT — подпись у него не спрашивают', async () => {
    const jwt = { verifyAccessToken: jest.fn() };
    const apiKeys = {
      resolve: jest.fn().mockResolvedValue({ ok: false, reason: 'unusable' }),
    };
    const guard = new AuthGuard(jwt as never, {} as never, apiKeys as never);
    const { ctx } = context({}, { headers: { authorization: 'Bearer vm_x' } });

    await expect(guard.canActivate(ctx)).rejects.toThrow();
    expect(jwt.verifyAccessToken).not.toHaveBeenCalled();
  });
});
