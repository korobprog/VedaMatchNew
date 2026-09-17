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
  const events = { emit: jest.fn() };
  const service = new AuthService(
    config as never,
    prisma as never,
    jwt as never,
    events as never,
    identities as never,
    providers as never,
  );
  const req = {
    hostname: 'api.vedamatch.com',
    headers: { host: 'api.vedamatch.com', 'user-agent': 'Telegram' },
    ip: '10.0.0.1',
  };
  const res = { cookie: jest.fn() };
  return { service, prisma, identities, providers, events, req, res };
}

describe('AuthService.loginWithTelegramWebApp', () => {
  it('подлинные данные — аккаунт telegram и cookie сессии на домене контура', async () => {
    const { service, prisma, identities, providers, events, req, res } =
      setup();

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
    // Источник входа для воронки метрик (веха 7) — мини-приложение Telegram.
    expect(prisma.loginAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'telegram',
          client: 'telegram',
        }),
      }),
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
    // Без allows_write_to_pm в initData — «Уведомления» узнают о связке, но
    // устройство не заведут: canWrite решает именно это поле.
    expect(events.emit).toHaveBeenCalledWith(
      'auth.telegram.connected',
      expect.objectContaining({
        userId: 'u42',
        telegramUserId: '42',
        canWrite: false,
      }),
    );
  });

  it('allows_write_to_pm в данных запуска — canWrite уходит true', async () => {
    const { service, events, req, res } = setup();

    await service.loginWithTelegramWebApp(
      { initData: initData(TOKEN, { ...TG_USER, allows_write_to_pm: true }) },
      req as never,
      res as never,
    );

    expect(events.emit).toHaveBeenCalledWith(
      'auth.telegram.connected',
      expect.objectContaining({ canWrite: true }),
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
