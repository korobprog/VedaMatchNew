import { ForbiddenException } from '@nestjs/common';
import { createHmac } from 'node:crypto';

// openid-client и jose — ESM-only, ts-jest их не транспилирует.
jest.mock('openid-client', () => ({}));
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import { AuthService } from './auth.service';

const TOKEN = '123456:TEST-token_for-specs-only-000000000';
const TG_USER = { id: 42, first_name: 'Нитай' };

function initData(token = TOKEN, user: object = TG_USER): string {
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

const account = {
  id: 'u42',
  email: 'tg-42@users.vedamatch.invalid',
  role: 'user',
  accountStatus: 'active',
  pendingDeletionAt: null,
  blockedUntil: null,
};

function setup(options: { token?: string; enabled?: boolean } = {}) {
  const prisma = {
    loginAudit: { create: jest.fn().mockResolvedValue({}) },
    contactsProfile: { createMany: jest.fn().mockResolvedValue({}) },
    refreshToken: { create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue(account) },
  };
  const values: Record<string, string | undefined> = {
    TELEGRAM_BOT_TOKEN: options.token ?? TOKEN,
    WEB_ORIGIN: 'https://vedamatch.com,https://ios.vedamatch.com',
    COOKIE_DOMAIN: '.vedamatch.ru',
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
  const jwt = { signAccessToken: jest.fn().mockResolvedValue('access-jwt') };
  const identities = {
    resolve: jest.fn().mockResolvedValue({ user: account, created: false }),
  };
  const providers = {
    assertEnabled: jest.fn(() =>
      options.enabled === false
        ? Promise.reject(new ForbiddenException('Этот способ входа недоступен'))
        : Promise.resolve(),
    ),
  };
  const service = new AuthService(
    config as never,
    prisma as never,
    jwt as never,
    { emit: jest.fn() } as never,
    identities as never,
    providers as never,
  );
  const req = {
    hostname: 'api.vedamatch.com',
    headers: { host: 'api.vedamatch.com', 'user-agent': 'Telegram' },
    ip: '10.0.0.1',
  };
  const res = { cookie: jest.fn() };
  return { service, identities, providers, req, res };
}

describe('AuthService.loginWithTelegramWebApp', () => {
  it('подлинные данные — аккаунт telegram и cookie сессии на домене контура', async () => {
    const { service, identities, providers, req, res } = setup();

    await expect(
      service.loginWithTelegramWebApp(
        { initData: initData() },
        req as never,
        res as never,
      ),
    ).resolves.toEqual({ ok: true });

    expect(providers.assertEnabled).toHaveBeenCalledWith(
      'telegram',
      'api.vedamatch.com',
    );
    expect(identities.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'telegram',
        externalId: '42',
        email: 'tg-42@users.vedamatch.invalid',
        name: 'Нитай',
      }),
      expect.objectContaining({ beforeCreate: expect.any(Function) }),
    );
    const cookies = res.cookie.mock.calls.map(([name, , opts]) => [
      name,
      opts.domain,
    ]);
    expect(cookies).toEqual(
      expect.arrayContaining([
        ['access_token', '.vedamatch.com'],
        ['refresh_token', '.vedamatch.com'],
      ]),
    );
  });

  it('чужая подпись — 401, аккаунт не ищется', async () => {
    const { service, identities, req, res } = setup();
    await expect(
      service.loginWithTelegramWebApp(
        { initData: initData('999:other-token-0000000000000000000') },
        req as never,
        res as never,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(identities.resolve).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('способ выключен для домена — 403 до проверки подписи', async () => {
    const { service, identities, req, res } = setup({ enabled: false });
    await expect(
      service.loginWithTelegramWebApp(
        { initData: initData() },
        req as never,
        res as never,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(identities.resolve).not.toHaveBeenCalled();
  });

  it('без токена бота — 503', async () => {
    const { service, req, res } = setup({ token: '' });
    await expect(
      service.loginWithTelegramWebApp(
        { initData: initData() },
        req as never,
        res as never,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('без данных запуска — 401', async () => {
    const { service, req, res } = setup();
    await expect(
      service.loginWithTelegramWebApp({}, req as never, res as never),
    ).rejects.toMatchObject({ status: 401 });
  });
});
