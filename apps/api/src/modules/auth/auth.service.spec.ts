import { UnauthorizedException } from '@nestjs/common';

// openid-client и jose — ESM-only, ts-jest их не транспилирует; в этих
// тестах Google-поток не нужен, поэтому модули заменяются пустышками.
jest.mock('openid-client', () => ({}));
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import {
  AuthService,
  RefreshRaceException,
  safeReturnTo,
} from './auth.service';
import { AuthProvidersService } from './auth-providers.service';
import { PersonalDataService } from '../personal-data/personal-data.service';
import { IdentityService } from './identity.service';

/**
 * refresh: ротация как CAS и reuse-detection. Google/OIDC здесь не трогаем.
 */
function makeService(
  stored: Record<string, unknown> | null,
  rotatedCount = 1,
  env: Record<string, string> = {},
) {
  const prisma = {
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue(stored),
      updateMany: jest.fn().mockResolvedValue({ count: rotatedCount }),
      create: jest.fn().mockResolvedValue({}),
    },
    user: { update: jest.fn() },
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => env[key] ?? fallback),
  };
  const jwt = { signAccessToken: jest.fn().mockResolvedValue('access') };
  const service = new AuthService(
    config as never,
    prisma as never,
    jwt as never,
    { emit: jest.fn() } as never,
    new IdentityService(
      prisma as never,
      new PersonalDataService(prisma as never, { isEnabled: false } as never),
    ),
    new AuthProvidersService(prisma as never),
  );
  const res = { cookie: jest.fn(), clearCookie: jest.fn() };
  // headers у настоящего запроса есть всегда, а контур входа читает из
  // них хост: без них refresh и logout падали бы только в тесте.
  const req = {
    cookies: { refresh_token: 'raw-token' },
    headers: { host: 'api.vedamatch.ru' },
  };
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
      // Токен из времён до семейств открывает семейство своим id.
      data: { revoked: true, revokedAt: expect.any(Date), familyId: 'rt1' },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ familyId: 'rt1' }),
    });
    // access + refresh + маркер vm_session
    expect(res.cookie).toHaveBeenCalledTimes(3);
    const marker = res.cookie.mock.calls.find(
      (call: unknown[]) => call[0] === 'vm_session',
    ) as [string, string, { httpOnly: boolean; path: string }];
    expect(marker[1]).toBe('1');
    expect(marker[2].httpOnly).toBe(false);
    expect(marker[2].path).toBe('/');
  });

  it('проигравший гонку параллельный refresh получает 401 без новой пары и не стирает cookie', async () => {
    const { service, prisma, req, res } = makeService(
      {
        id: 'rt1',
        userId: 'u1',
        revoked: false,
        familyId: 'f1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: activeUser,
      },
      0,
    );
    await expect(
      service.refresh(req as never, res as never),
    ).rejects.toBeInstanceOf(RefreshRaceException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    // Победитель гонки уже поставил браузеру свежие cookie и маркер —
    // стирать нельзя ни одну.
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('при мёртвом refresh снимает все cookie сессии, а не только маркер', async () => {
    const { service, req, res } = makeService(null);
    await expect(
      service.refresh(req as never, res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'vm_session',
      expect.objectContaining({ path: '/' }),
    );
    // Без этого вкладка сайта предъявляла отозванный токен снова и снова.
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/auth' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ path: '/' }),
    );
  });

  it('давний повтор отозванного токена отзывает его семейство, а не все сессии пользователя', async () => {
    const { service, prisma, req, res } = makeService({
      id: 'rt1',
      userId: 'u1',
      revoked: true,
      familyId: 'web-family',
      revokedAt: new Date(Date.now() - 10 * 60_000),
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    await expect(
      service.refresh(req as never, res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', familyId: 'web-family', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/auth' }),
    );
  });

  it('отозванный до семейств токен отзывает только безсемейные токены', async () => {
    const { service, prisma, req, res } = makeService({
      id: 'rt1',
      userId: 'u1',
      revoked: true,
      familyId: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    await expect(
      service.refresh(req as never, res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', familyId: null, revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) },
    });
  });

  it('повтор только что ротированного токена — гонка: ничего не отзывает', async () => {
    const { service, prisma, req, res } = makeService({
      id: 'rt1',
      userId: 'u1',
      revoked: true,
      familyId: 'f1',
      revokedAt: new Date(Date.now() - 2_000),
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    await expect(
      service.refresh(req as never, res as never),
    ).rejects.toBeInstanceOf(RefreshRaceException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    // Свежие cookie соседнего запроса не стираются, маркер тоже.
    expect(
      (res as { clearCookie: jest.Mock }).clearCookie,
    ).not.toHaveBeenCalled();
  });

  it('refreshApp: давний повтор не трогает сессии других входов', async () => {
    const { service, prisma } = makeService({
      id: 'rt9',
      userId: 'u1',
      revoked: true,
      familyId: 'app-family',
      revokedAt: new Date(Date.now() - 60 * 60_000),
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    await expect(
      service.refreshApp({ refreshToken: 'raw' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const where = prisma.refreshToken.updateMany.mock.calls[0][0].where;
    expect(where).toEqual({
      userId: 'u1',
      familyId: 'app-family',
      revoked: false,
    });
  });

  it('новый вход открывает новое семейство', async () => {
    const { service, prisma } = makeService(null);
    await (
      service as unknown as {
        appTokens: (user: typeof activeUser) => Promise<unknown>;
      }
    ).appTokens(activeUser);
    const data = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(data.familyId).toMatch(/^[0-9a-f-]{36}$/);
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
      { cookies: {}, headers: { host: 'api.vedamatch.ru' } } as never,
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
  const identities = new IdentityService(
    prisma as never,
    new PersonalDataService(prisma as never, { isEnabled: false } as never),
  );
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
      userIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'victim', email: 'a@b.c' }),
        create: jest.fn(),
      },
    });

    await expect(
      service.resolveGoogleProfile({
        sub: 'new-sub',
        email: 'a@b.c',
        name: 'Кто-то',
      }),
    ).rejects.toThrow(/уже используется/);
  });

  it('пускает прежнего пользователя по перенесённой идентичности', async () => {
    const create = jest.fn();
    const service = makeGoogleService({
      userIdentity: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'i1',
            user: { id: 'u-old', email: 'a@b.c' },
          }),
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

/**
 * Контур входа: cookie снимаются на домене того портала, с которого пришёл
 * запрос. Раньше домен брался из COOKIE_DOMAIN, один на весь сервис, и выход
 * на глобальном контуре не снимал ничего: браузер отбрасывает cookie с
 * Domain=.vedamatch.ru, выставленную с хоста api.vedamatch.com.
 */
describe('AuthService и контуры', () => {
  const env = {
    WEB_ORIGIN: 'https://vedamatch.ru,https://vedamatch.com',
    COOKIE_DOMAIN: '.vedamatch.ru',
  };

  async function logoutFrom(host: string) {
    const { service } = makeService(null, 1, env);
    const clearCookie = jest.fn();
    await service.logout(
      { cookies: {}, headers: { host } } as never,
      { cookie: jest.fn(), clearCookie } as never,
    );
    return clearCookie.mock.calls.map(
      (call: unknown[]) => (call[1] as { domain?: string }).domain,
    );
  }

  it('выход на глобальном контуре снимает cookie его домена', async () => {
    expect(new Set(await logoutFrom('api.vedamatch.com'))).toEqual(
      new Set(['.vedamatch.com']),
    );
  });

  it('выход на российском контуре работает как прежде', async () => {
    expect(new Set(await logoutFrom('api.vedamatch.ru'))).toEqual(
      new Set(['.vedamatch.ru']),
    );
  });

  it('незнакомый хост остаётся на настройке сервиса', async () => {
    // Превью-деплои и вход по адресу сервера: заголовку Host доверия нет.
    expect(new Set(await logoutFrom('api.evil.example'))).toEqual(
      new Set(['.vedamatch.ru']),
    );
  });
});
