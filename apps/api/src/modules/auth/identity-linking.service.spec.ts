import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHmac } from 'node:crypto';

// openid-client и jose — ESM-only, ts-jest их не транспилирует. Функции
// старта заведены рабочими стендами — startGoogleLogin с link=1 доходит до
// них до колбэка (обмен кода здесь не проверяется, см. telegram-login.service.spec.ts
// про то, почему сам обмен кода в юнит-тестах не трогают).
jest.mock('openid-client', () => ({
  randomPKCECodeVerifier: () => 'verifier',
  calculatePKCECodeChallenge: () => Promise.resolve('challenge'),
  randomState: () => 'state',
  randomNonce: () => 'nonce',
  buildAuthorizationUrl: () =>
    new URL('https://accounts.google.com/o/oauth2/auth?x=1'),
}));
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import { AuthService } from './auth.service';
import type { Contour } from './contour';

const TOKEN = '123456:TEST-token_for-specs-only-000000000';
const TG_USER = { id: 42, first_name: 'Нитай' };

function telegramInitData(user: object = TG_USER, token = TOKEN): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000) - 5),
    user: JSON.stringify(user),
  };
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

/**
 * Веха 3, «Привязка способов входа»: привязка Google/Яндекс/Telegram живой
 * сессией, отвязка и список для экрана «Аккаунт». Google/OIDC-обмен кода
 * здесь не трогаем (см. `telegram-login.service.spec.ts`) — тестируется то,
 * что решает сама `AuthService`: чья сессия, кому досталась идентичность,
 * какой редирект/отказ.
 */
function setup(overrides: { identities?: Record<string, unknown> } = {}) {
  const prisma = {};
  const values: Record<string, string | undefined> = {
    WEB_ORIGIN: 'https://vedamatch.com,https://ios.vedamatch.com',
    COOKIE_DOMAIN: '.vedamatch.com',
    TELEGRAM_BOT_TOKEN: TOKEN,
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
  const jwt = {
    signAccessToken: jest.fn().mockResolvedValue('access'),
    verifyAccessToken: jest.fn(),
  };
  const identities = {
    listIdentities: jest.fn().mockResolvedValue([]),
    link: jest.fn().mockResolvedValue('created'),
    unlink: jest.fn().mockResolvedValue(undefined),
    ...overrides.identities,
  };
  const providers = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(
    config as never,
    prisma as never,
    jwt as never,
    { emit: jest.fn() } as never,
    identities as never,
    providers as never,
  );
  return { service, jwt, identities, providers, config };
}

describe('AuthService.listIdentities', () => {
  it('делегирует IdentityService', async () => {
    const { service, identities } = setup();
    identities.listIdentities.mockResolvedValue([
      {
        provider: 'google',
        createdAt: new Date(),
        lastLoginAt: null,
        canUnlink: false,
      },
    ]);

    await expect(service.listIdentities('u1')).resolves.toEqual([
      expect.objectContaining({ provider: 'google' }),
    ]);
    expect(identities.listIdentities).toHaveBeenCalledWith('u1');
  });
});

describe('AuthService.unlinkIdentity', () => {
  it('неизвестный провайдер из URL — 400, IdentityService не вызывается', async () => {
    const { service, identities } = setup();
    await expect(service.unlinkIdentity('u1', 'apple')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(identities.unlink).not.toHaveBeenCalled();
  });

  it('известный провайдер — отвязка через IdentityService', async () => {
    const { service, identities } = setup();
    await expect(service.unlinkIdentity('u1', 'google')).resolves.toEqual({
      ok: true,
    });
    expect(identities.unlink).toHaveBeenCalledWith('u1', 'google');
  });
});

describe('AuthService.linkTelegram', () => {
  it('подлинные данные — привязка идентичности к текущему пользователю', async () => {
    const { service, identities, providers } = setup();
    const req = { hostname: 'ios.vedamatch.com' };

    await expect(
      service.linkTelegram(
        'u1',
        { initData: telegramInitData() },
        req as never,
      ),
    ).resolves.toEqual({ ok: true });

    expect(providers.assertEnabled).toHaveBeenCalledWith(
      'telegram',
      'ios.vedamatch.com',
    );
    expect(identities.link).toHaveBeenCalledWith('u1', 'telegram', '42');
  });

  it('чужая подпись — 401, идентичность не трогается', async () => {
    const { service, identities } = setup();
    const req = { hostname: 'ios.vedamatch.com' };

    await expect(
      service.linkTelegram(
        'u1',
        {
          initData: telegramInitData(
            TG_USER,
            '999:other-token-0000000000000000000',
          ),
        },
        req as never,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(identities.link).not.toHaveBeenCalled();
  });

  it('способ уже привязан к другому — отказ конфликтом уезжает наружу', async () => {
    const { service } = setup({
      identities: {
        link: jest.fn().mockRejectedValue(new ConflictException('занято')),
      },
    });
    const req = { hostname: 'ios.vedamatch.com' };

    await expect(
      service.linkTelegram(
        'u1',
        { initData: telegramInitData() },
        req as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService.startGoogleLogin с link=1', () => {
  it('нет живой сессии — редирект назад с linkError=session, cookie не выставляется', async () => {
    const { service } = setup();
    // onModuleInit (discovery у настоящего Google) в тесте не запускается —
    // ключи не нужны для решения, которое проверяется здесь.
    (service as unknown as { google: unknown }).google = {};
    const req = { cookies: {} };
    const res = { redirect: jest.fn(), cookie: jest.fn() };

    await service.startGoogleLogin(
      req as never,
      res as never,
      '/account',
      undefined,
      undefined,
      'api.vedamatch.com',
      null,
      undefined,
      true,
    );

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/account?linkError=session'),
    );
  });

  it('живая сессия — id уходит в OIDC-cookie для колбэка', async () => {
    const { service, jwt } = setup();
    (service as unknown as { google: unknown }).google = {};
    jwt.verifyAccessToken.mockResolvedValue({
      sub: 'u1',
      email: 'a@b.c',
      role: 'user',
    });
    const req = { cookies: { access_token: 'tok' } };
    const res = { redirect: jest.fn(), cookie: jest.fn() };

    await service.startGoogleLogin(
      req as never,
      res as never,
      '/account',
      undefined,
      undefined,
      'api.vedamatch.com',
      null,
      undefined,
      true,
    );

    // Редирект здесь есть — но уже к Google, а не назад с ошибкой.
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('accounts.google.com'),
    );
    const [[, payload]] = res.cookie.mock.calls as [[string, string, unknown]];
    expect(JSON.parse(payload)).toEqual(
      expect.objectContaining({ link: 'u1' }),
    );
  });
});

describe('AuthService.finishLinking (приватный хвост колбэка привязки)', () => {
  type Subject = {
    finishLinking(params: {
      req: unknown;
      res: unknown;
      contour: Contour;
      expectedUserId: string;
      provider: 'google' | 'yandex';
      externalId: string;
      returnTo?: string;
      returnOrigin?: string | null;
    }): Promise<void>;
  };

  const contour: Contour = {
    apiOrigin: 'https://api.vedamatch.com',
    webOrigin: 'https://vedamatch.com',
    cookieDomain: '.vedamatch.com',
  };

  it('сессия колбэка совпала с той, что начала привязку — идентичность создаётся, редирект с ?linked=', async () => {
    const { service, jwt, identities } = setup();
    jwt.verifyAccessToken.mockResolvedValue({
      sub: 'u1',
      email: 'a@b.c',
      role: 'user',
    });
    const req = { cookies: { access_token: 'tok' } };
    const res = { redirect: jest.fn() };

    await (service as unknown as Subject).finishLinking({
      req,
      res,
      contour,
      expectedUserId: 'u1',
      provider: 'google',
      externalId: 'g-1',
      returnTo: '/account',
      returnOrigin: null,
    });

    expect(identities.link).toHaveBeenCalledWith('u1', 'google', 'g-1');
    expect(res.redirect).toHaveBeenCalledWith(
      'https://vedamatch.com/account?linked=google',
    );
  });

  it('сессия на колбэке принадлежит другому — подмена cookie отклоняется', async () => {
    const { service, jwt, identities } = setup();
    jwt.verifyAccessToken.mockResolvedValue({
      sub: 'attacker',
      email: 'x@y.z',
      role: 'user',
    });
    const req = { cookies: { access_token: 'tok' } };
    const res = { redirect: jest.fn() };

    await (service as unknown as Subject).finishLinking({
      req,
      res,
      contour,
      expectedUserId: 'u1',
      provider: 'google',
      externalId: 'g-1',
      returnTo: '/account',
      returnOrigin: null,
    });

    expect(identities.link).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://vedamatch.com/account?linkError=session',
    );
  });

  it('идентичность уже принадлежит чужому аккаунту — ?linkError=conflict', async () => {
    const { service, identities, jwt } = setup({
      identities: {
        link: jest.fn().mockRejectedValue(new ConflictException('занято')),
      },
    });
    jwt.verifyAccessToken.mockResolvedValue({
      sub: 'u1',
      email: 'a@b.c',
      role: 'user',
    });
    const req = { cookies: { access_token: 'tok' } };
    const res = { redirect: jest.fn() };

    await (service as unknown as Subject).finishLinking({
      req,
      res,
      contour,
      expectedUserId: 'u1',
      provider: 'yandex',
      externalId: 'y-1',
      returnTo: '/account',
      returnOrigin: null,
    });

    expect(identities.link).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://vedamatch.com/account?linkError=conflict',
    );
  });
});
