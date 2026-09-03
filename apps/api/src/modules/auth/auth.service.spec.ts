import { UnauthorizedException } from '@nestjs/common';

// openid-client и jose — ESM-only, ts-jest их не транспилирует; в этих
// тестах Google-поток не нужен, поэтому модули заменяются пустышками.
jest.mock('openid-client', () => ({}));
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import { AuthService, safeReturnTo } from './auth.service';
import { AuthProvidersService } from './auth-providers.service';
import { PersonalDataService } from '../personal-data/personal-data.service';
import { IdentityService } from './identity.service';

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
    { emit: jest.fn() } as never,
    new IdentityService(prisma as never, new PersonalDataService({ isEnabled: false } as never)),
    new AuthProvidersService(prisma as never),
  );
  const res = { cookie: jest.fn(), clearCookie: jest.fn() };
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
    // access + refresh + маркер vm_session
    expect(res.cookie).toHaveBeenCalledTimes(3);
    const marker = res.cookie.mock.calls.find(
      (call: unknown[]) => call[0] === 'vm_session',
    ) as [string, string, { httpOnly: boolean; path: string }];
    expect(marker[1]).toBe('1');
    expect(marker[2].httpOnly).toBe(false);
    expect(marker[2].path).toBe('/');
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

  it('при мёртвом refresh снимает маркер vm_session', async () => {
    const { service, req, res } = makeService(null);
    await expect(
      service.refresh(req as never, res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'vm_session',
      expect.objectContaining({ path: '/' }),
    );
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

describe('AuthService.logout', () => {
  it('снимает access, refresh и маркер vm_session', async () => {
    const { service, res } = makeService(null);
    const clearCookie = jest.fn();
    await service.logout(
      { cookies: {} } as never,
      { ...res, clearCookie } as never,
    );
    const names = clearCookie.mock.calls.map((call: unknown[]) => call[0]);
    expect(names).toEqual(
      expect.arrayContaining(['access_token', 'refresh_token', 'vm_session']),
    );
  });
});

describe('safeReturnTo', () => {
  it('пропускает только внутренний путь с одной ведущей косой', () => {
    expect(safeReturnTo('/union?tab=matches')).toBe('/union?tab=matches');
    expect(safeReturnTo('/')).toBe('/');
    expect(safeReturnTo('/notices/abc#top')).toBe('/notices/abc#top');
  });

  it('всё остальное превращает в «/»', () => {
    for (const bad of [
      undefined,
      null,
      42,
      '',
      'union',
      '//evil.example',
      '/\\evil.example',
      'https://evil.example/x',
      'javascript:alert(1)',
      '/foo\nSet-Cookie: x',
      '/x'.padEnd(3000, 'a'),
    ]) {
      expect(safeReturnTo(bad)).toBe('/');
    }
  });
});

/**
 * Колбэк Google целиком не собрать: openid-client здесь заглушен. Проверяется
 * та часть, где по claims находят человека, — она вынесена в отдельный метод.
 */
function makeGoogleService(prisma: Record<string, unknown>) {
  const identities = new IdentityService(prisma as never, new PersonalDataService({ isEnabled: false } as never));
  return new AuthService(
    { get: jest.fn((_key: string, fallback?: string) => fallback) } as never,
    prisma as never,
    { signAccessToken: jest.fn() } as never,
    { emit: jest.fn() } as never,
    identities,
    new AuthProvidersService(prisma as never),
  );
}

describe('AuthService.resolveGoogleProfile', () => {
  it('не отдаёт существующий аккаунт при совпадении почты у нового googleId', async () => {
    // Пользователь с этим адресом есть, но идентичности google с таким sub нет.
    const service = makeGoogleService({
      userIdentity: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'victim', email: 'a@b.c' }),
        create: jest.fn(),
      },
    });

    await expect(
      service.resolveGoogleProfile({ sub: 'new-sub', email: 'a@b.c', name: 'Кто-то' }),
    ).rejects.toThrow(/уже используется/);
  });

  it('пускает прежнего пользователя по перенесённой идентичности', async () => {
    const create = jest.fn();
    const service = makeGoogleService({
      userIdentity: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'i1', user: { id: 'u-old', email: 'a@b.c' } }),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn(), create },
    });

    const { user, created } = await service.resolveGoogleProfile({
      sub: 'old-sub',
      email: 'a@b.c',
      name: 'Прежний',
    });

    expect(created).toBe(false);
    expect(user.id).toBe('u-old');
    expect(create).not.toHaveBeenCalled();
  });
});
