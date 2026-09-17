import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

// openid-client и jose — ESM-only, ts-jest их не транспилирует.
jest.mock('openid-client', () => ({}));
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import { AuthService } from './auth.service';
import { pkceChallengeS256 } from './app-login';

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

const activeUser = {
  id: 'u1',
  email: 'a@b.c',
  role: 'user',
  accountStatus: 'active',
  pendingDeletionAt: null,
  blockedUntil: null,
};

function makeService(options: {
  code?: Record<string, unknown> | null;
  claimedCount?: number;
  refresh?: Record<string, unknown> | null;
}) {
  const prisma = {
    appLoginCode: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(options.code ?? null),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options.claimedCount ?? 1 }),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(options.refresh ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
  };
  const jwt = { signAccessToken: jest.fn().mockResolvedValue('access-jwt') };
  const service = new AuthService(
    config as never,
    prisma as never,
    jwt as never,
    { emit: jest.fn() } as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, jwt };
}

function storedCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: 'u1',
    codeChallenge: pkceChallengeS256(VERIFIER),
    expiresAt: new Date(Date.now() + 30_000),
    usedAt: null,
    user: activeUser,
    ...overrides,
  };
}

describe('AuthService.exchangeAppLoginCode', () => {
  it('меняет код на пару токенов в теле ответа и гасит код условием usedAt=null', async () => {
    const { service, prisma } = makeService({ code: storedCode() });

    const tokens = await service.exchangeAppLoginCode({
      code: 'raw-code',
      codeVerifier: VERIFIER,
    });

    expect(tokens).toEqual({
      accessToken: 'access-jwt',
      refreshToken: expect.stringMatching(/^[0-9a-f]{96}$/),
      expiresIn: 15 * 60,
      refreshExpiresIn: 30 * 24 * 60 * 60,
    });
    expect(prisma.appLoginCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    // Хранится хеш, а не сам код.
    const where = prisma.appLoginCode.findUnique.mock.calls[0][0].where;
    expect(where.codeHash).not.toBe('raw-code');
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('чужой верификатор сжигает код: второй попытки нет', async () => {
    const { service, prisma } = makeService({ code: storedCode() });
    await expect(
      service.exchangeAppLoginCode({
        code: 'raw-code',
        codeVerifier: `${VERIFIER.slice(0, -1)}Y`,
      }),
    ).rejects.toThrow('Код входа недействителен');
    expect(prisma.appLoginCode.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('погашенный, протухший и неизвестный код отвечают одинаково', async () => {
    for (const code of [
      storedCode({ usedAt: new Date() }),
      storedCode({ expiresAt: new Date(Date.now() - 1) }),
      null,
    ]) {
      const { service, prisma } = makeService({ code });
      await expect(
        service.exchangeAppLoginCode({ code: 'raw', codeVerifier: VERIFIER }),
      ).rejects.toThrow('Код входа недействителен');
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    }
  });

  it('проигравший гонку параллельный обмен не получает токенов', async () => {
    const { service, prisma } = makeService({
      code: storedCode(),
      claimedCount: 0,
    });
    await expect(
      service.exchangeAppLoginCode({ code: 'raw', codeVerifier: VERIFIER }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('не принимает код не той формы, не спрашивая базу', async () => {
    const { service, prisma } = makeService({});
    for (const code of [undefined, '', 42, 'x'.repeat(129)]) {
      await expect(
        service.exchangeAppLoginCode({ code, codeVerifier: VERIFIER }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(prisma.appLoginCode.findUnique).not.toHaveBeenCalled();
  });

  it('заблокированному аккаунту код не помогает', async () => {
    const { service, prisma } = makeService({
      code: storedCode({
        user: { ...activeUser, accountStatus: 'blocked' },
      }),
    });
    await expect(
      service.exchangeAppLoginCode({ code: 'raw', codeVerifier: VERIFIER }),
    ).rejects.toThrow('Аккаунт заблокирован');
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe('AuthService.refreshApp и logoutApp', () => {
  it('ротирует refresh из тела запроса и отдаёт новую пару без cookie', async () => {
    const { service, prisma } = makeService({
      refresh: {
        id: 'rt1',
        userId: 'u1',
        revoked: false,
        familyId: 'fam-app',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: activeUser,
      },
    });
    const tokens = await service.refreshApp({ refreshToken: 'raw-refresh' });
    expect(tokens.accessToken).toBe('access-jwt');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt1', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date), familyId: 'fam-app' },
    });
    // Новая пара остаётся в семействе входа приложения.
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', familyId: 'fam-app' }),
    });
  });

  it('без refresh-токена в теле — 401', async () => {
    const { service } = makeService({});
    await expect(service.refreshApp({})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      service.refreshApp({ refreshToken: 123 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('выход отзывает переданный refresh по хешу', async () => {
    const { service, prisma } = makeService({});
    await expect(service.logoutApp({ refreshToken: 'raw' })).resolves.toEqual({
      ok: true,
    });
    const call = prisma.refreshToken.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ revoked: true, revokedAt: expect.any(Date) });
    expect(call.where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('AuthService: ошибки входа из приложения', () => {
  type WithAppErrors = {
    withAppErrors: (
      app: { redirect: string; challenge: string } | null,
      res: unknown,
      run: () => Promise<void>,
    ) => Promise<void>;
  };
  const app = { redirect: 'vedamatch://auth', challenge: 'c' };
  const makeRes = () => {
    const res = {
      redirect: jest.fn(),
      setHeader: jest.fn(),
      send: jest.fn(),
      type: jest.fn(),
    };
    res.type.mockReturnValue(res);
    return res;
  };

  it('понятный отказ уезжает в приложение текстом через страницу возврата', async () => {
    const { service } = makeService({});
    const res = makeRes();
    await (service as unknown as WithAppErrors).withAppErrors(app, res, () =>
      Promise.reject(
        new ForbiddenException('Регистрация новых участников сейчас закрыта'),
      ),
    );
    // Редирект с колбэка Chrome может молча отбросить, страница с кнопкой — нет.
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.type).toHaveBeenCalledWith('html');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    const [[html]] = res.send.mock.calls as [string][];
    const href = /href="([^"]+)"/.exec(html)?.[1].replace(/&amp;/g, '&');
    const url = new URL(href as string);
    expect(url.protocol).toBe('vedamatch:');
    expect(url.searchParams.get('error')).toBe(
      'Регистрация новых участников сейчас закрыта',
    );
  });

  it('вход с сайта и сбои сервера бросаются как раньше', async () => {
    const { service } = makeService({});
    const res = makeRes();
    const subject = service as unknown as WithAppErrors;
    await expect(
      subject.withAppErrors(null, res, () =>
        Promise.reject(new ForbiddenException('x')),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      subject.withAppErrors(app, res, () => Promise.reject(new Error('db'))),
    ).rejects.toThrow('db');
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

describe('AuthService: провайдер не настроен при входе из приложения', () => {
  const app = { redirect: 'vedamatch://auth', challenge: 'c' };

  it('Google без ключей возвращает ошибку в приложение, а не JSON в браузер', async () => {
    const { service } = makeService({});
    const req = { cookies: {} };
    const res = { redirect: jest.fn(), cookie: jest.fn() };
    await service.startGoogleLogin(
      req as never,
      res as never,
      undefined,
      undefined,
      undefined,
      'api.vedamatch.ru',
      app,
    );
    const url = new URL(res.redirect.mock.calls[0][0] as string);
    expect(url.protocol).toBe('vedamatch:');
    expect(url.searchParams.get('error')).toContain('Google');
  });

  it('вход с сайта без ключей по-прежнему отвечает 503', async () => {
    const { service } = makeService({});
    const req = { cookies: {} };
    const res = { redirect: jest.fn(), cookie: jest.fn() };
    await expect(
      service.startGoogleLogin(
        req as never,
        res as never,
        undefined,
        undefined,
        undefined,
        'api.vedamatch.ru',
        null,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

// Веб-версия приложения (ios.vedamatch.com): вход начат на поддомене, и после
// колбэка человек должен вернуться туда же, а не на портал.
describe('AuthService: возврат после входа на поддомен', () => {
  type WithRedirect = {
    ensureContactsProfile(userId: string): Promise<void>;
    issueSessionAndRedirect(params: Record<string, unknown>): Promise<void>;
  };

  function setup(webOrigins: string) {
    const { service, prisma } = makeService({});
    const extended = prisma as unknown as Record<string, unknown>;
    const loginAuditCreate = jest.fn().mockResolvedValue({});
    extended.loginAudit = { create: loginAuditCreate };
    extended.user = { findUnique: jest.fn().mockResolvedValue(activeUser) };
    const config = (service as unknown as { config: { get: jest.Mock } })
      .config;
    config.get.mockImplementation((key: string, fallback?: string) =>
      key === 'WEB_ORIGIN' ? webOrigins : fallback,
    );
    const subject = service as unknown as WithRedirect;
    jest.spyOn(subject, 'ensureContactsProfile').mockResolvedValue();
    const res = { redirect: jest.fn(), cookie: jest.fn() };
    const req = {
      headers: { host: 'api.vedamatch.com', 'user-agent': 'test' },
      ip: '127.0.0.1',
    };
    return { subject, res, req, loginAuditCreate };
  }

  const params = (returnOrigin: string | null) => ({
    user: activeUser,
    provider: 'google',
    isNewAccount: false,
    returnTo: '/chat/c1',
    returnOrigin,
    app: null,
  });

  it('разрешённый поддомен — туда, с тем же путём, а в журнале — web-app', async () => {
    const { subject, res, req, loginAuditCreate } = setup(
      'https://vedamatch.com,https://ios.vedamatch.com',
    );
    await subject.issueSessionAndRedirect({
      req,
      res,
      ...params('https://ios.vedamatch.com'),
    });
    expect(res.redirect).toHaveBeenCalledWith(
      'https://ios.vedamatch.com/chat/c1',
    );
    expect(loginAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ client: 'web-app' }),
      }),
    );
  });

  it('без поддомена в WEB_ORIGIN — на портал контура, а в журнале — site', async () => {
    const { subject, res, req, loginAuditCreate } = setup(
      'https://vedamatch.com',
    );
    await subject.issueSessionAndRedirect({
      req,
      res,
      ...params('https://ios.vedamatch.com'),
    });
    expect(res.redirect).toHaveBeenCalledWith('https://vedamatch.com/chat/c1');
    expect(loginAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ client: 'site' }),
      }),
    );
  });

  it('вход с PKCE приложения — код возврата, а в журнале — android, независимо от returnOrigin', async () => {
    const { service, prisma } = makeService({});
    const extended = prisma as unknown as Record<string, unknown>;
    const loginAuditCreate = jest.fn().mockResolvedValue({});
    extended.loginAudit = { create: loginAuditCreate };
    extended.appLoginCode = { create: jest.fn().mockResolvedValue({}) };
    const config = (service as unknown as { config: { get: jest.Mock } })
      .config;
    config.get.mockImplementation((key: string, fallback?: string) =>
      key === 'WEB_ORIGIN'
        ? 'https://vedamatch.com,https://ios.vedamatch.com'
        : fallback,
    );
    const subject = service as unknown as WithRedirect;
    jest.spyOn(subject, 'ensureContactsProfile').mockResolvedValue();
    const res = {
      redirect: jest.fn(),
      cookie: jest.fn(),
      setHeader: jest.fn(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    const req = {
      headers: { host: 'api.vedamatch.com', 'user-agent': 'test' },
      ip: '127.0.0.1',
    };

    await subject.issueSessionAndRedirect({
      req,
      res,
      ...params('https://ios.vedamatch.com'),
      app: { redirect: 'vedamatch://auth', challenge: 'c' },
    });

    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
    expect(loginAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ client: 'android' }),
      }),
    );
  });
});
