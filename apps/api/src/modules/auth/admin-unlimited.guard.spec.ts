import type { ExecutionContext } from '@nestjs/common';

// jose — ESM-only, ts-jest его не транспилирует; verifyAccessToken мокается.
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import { AdminAwareThrottlerGuard } from './admin-unlimited.guard';

type Shoulder = { shouldSkip: (ctx: ExecutionContext) => Promise<boolean> };

function context(cookies: Record<string, string>): ExecutionContext {
  const req = { headers: {}, cookies };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => function handler() {},
    getClass: () => class SomeController {},
  } as unknown as ExecutionContext;
}

function buildGuard(exempt: boolean, roleFromToken?: string) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(exempt) };
  const jwt = {
    verifyAccessToken: jest.fn().mockImplementation(() =>
      roleFromToken
        ? Promise.resolve({ sub: 'u1', email: 'a@b.c', role: roleFromToken })
        : Promise.reject(new Error('bad token')),
    ),
  };
  const guard = new AdminAwareThrottlerGuard(
    {} as never,
    {} as never,
    reflector as never,
    jwt as never,
  );
  return guard as unknown as Shoulder;
}

describe('AdminAwareThrottlerGuard.shouldSkip', () => {
  it('не трогает маршруты без @AdminUnlimited()', async () => {
    const guard = buildGuard(false, 'admin');
    await expect(
      guard.shouldSkip(context({ access_token: 't' })),
    ).resolves.toBe(false);
  });

  it('пропускает админа на маршруте с @AdminUnlimited()', async () => {
    const guard = buildGuard(true, 'admin');
    await expect(
      guard.shouldSkip(context({ access_token: 't' })),
    ).resolves.toBe(true);
  });

  it('не пропускает обычного пользователя даже на отмеченном маршруте', async () => {
    const guard = buildGuard(true, 'user');
    await expect(
      guard.shouldSkip(context({ access_token: 't' })),
    ).resolves.toBe(false);
  });

  it('без токена не пропускает', async () => {
    const guard = buildGuard(true);
    await expect(guard.shouldSkip(context({}))).resolves.toBe(false);
  });

  it('недействительный токен не пропускает', async () => {
    const guard = buildGuard(true);
    await expect(
      guard.shouldSkip(context({ access_token: 'bad' })),
    ).resolves.toBe(false);
  });
});
