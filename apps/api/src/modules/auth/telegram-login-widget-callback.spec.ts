import { ForbiddenException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';

// openid-client и jose — ESM-only, ts-jest их не транспилирует.
jest.mock('openid-client', () => ({}));
jest.mock('./jwt.service', () => ({ JwtSignService: class {} }));

import { AuthService } from './auth.service';

const TOKEN = '123456:LOCAL-test-token-000000000000000000';

/** Подпись виджета по формуле документации — независимо от проверяемого кода. */
function widgetQuery(
  overrides: Record<string, string> = {},
  token = TOKEN,
): Record<string, string> {
  const values: Record<string, string> = {
    id: '42',
    first_name: 'Нитай',
    auth_date: String(Math.floor(Date.now() / 1000) - 5),
    ...overrides,
  };
  const dataCheckString = Object.keys(values)
    .sort()
    .map((key) => `${key}=${values[key]}`)
    .join('\n');
  const secret = createHash('sha256').update(token).digest();
  const hash = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');
  return { ...values, hash };
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
  };
  const values: Record<string, string | undefined> = {
    TELEGRAM_BOT_TOKEN: options.token ?? TOKEN,
    WEB_ORIGIN: 'https://vedamatch.com,https://ios.vedamatch.com',
    COOKIE_DOMAIN: '.vedamatch.com',
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
    headers: { host: 'api.vedamatch.com', 'user-agent': 'Mozilla/5.0' },
    ip: '10.0.0.1',
  };
  const res = { redirect: jest.fn(), cookie: jest.fn() };
  return { service, prisma, identities, providers, events, req, res };
}

describe('AuthService.handleTelegramWidgetCallback', () => {
  it('подлинные данные — сессия и редирект на портал контура с returnTo', async () => {
    const { service, prisma, identities, providers, events, req, res } =
      setup();

    await service.handleTelegramWidgetCallback(
      req as never,
      res as never,
      widgetQuery(),
      '/union/matches',
    );

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
    // Источник входа для воронки метрик — сайт, а не мини-приложение.
    expect(prisma.loginAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: 'telegram', client: 'site' }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'auth.telegram.connected',
      expect.objectContaining({ userId: 'u42', telegramUserId: '42' }),
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
    expect(res.redirect).toHaveBeenCalledWith(
      'https://vedamatch.com/union/matches',
    );
  });

  it('без returnTo — редирект на корень портала', async () => {
    const { service, req, res } = setup();
    await service.handleTelegramWidgetCallback(
      req as never,
      res as never,
      widgetQuery(),
    );
    expect(res.redirect).toHaveBeenCalledWith('https://vedamatch.com/');
  });

  it('постороннее поле query (returnTo/returnOrigin) не портит подпись', async () => {
    const { service, identities, res, req } = setup();
    await service.handleTelegramWidgetCallback(
      req as never,
      res as never,
      {
        ...widgetQuery(),
        returnTo: '/x',
        returnOrigin: 'https://evil.example',
      },
      '/x',
    );
    expect(identities.resolve).toHaveBeenCalled();
    // Чужой origin не в WEB_ORIGIN — редирект остаётся на портале контура.
    expect(res.redirect).toHaveBeenCalledWith('https://vedamatch.com/x');
  });

  it('подмена поля (id) — 401, аккаунт не ищется, cookie не выставляются', async () => {
    const { service, identities, res, req } = setup();
    const tampered = { ...widgetQuery(), id: '999999' };
    await expect(
      service.handleTelegramWidgetCallback(
        req as never,
        res as never,
        tampered,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(identities.resolve).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('чужой токен бота — 401', async () => {
    const { service, identities, res, req } = setup();
    await expect(
      service.handleTelegramWidgetCallback(
        req as never,
        res as never,
        widgetQuery({}, '999:other-token-0000000000000000000'),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(identities.resolve).not.toHaveBeenCalled();
  });

  it('просроченные данные (>24ч) — 401', async () => {
    const { service, identities, res, req } = setup();
    const expired = widgetQuery({
      auth_date: String(Math.floor(Date.now() / 1000) - 25 * 3600),
    });
    await expect(
      service.handleTelegramWidgetCallback(req as never, res as never, expired),
    ).rejects.toMatchObject({ status: 401 });
    expect(identities.resolve).not.toHaveBeenCalled();
  });

  it('без токена бота — 503', async () => {
    const { service, res, req } = setup({ token: '' });
    await expect(
      service.handleTelegramWidgetCallback(
        req as never,
        res as never,
        widgetQuery(),
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('способ выключен для домена — 403 до проверки подписи', async () => {
    const { service, identities, res, req } = setup({ enabled: false });
    await expect(
      service.handleTelegramWidgetCallback(
        req as never,
        res as never,
        widgetQuery(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(identities.resolve).not.toHaveBeenCalled();
  });

  it('returnOrigin в списке WEB_ORIGIN — редирект уходит туда, а не на портал контура', async () => {
    const { service, res, req } = setup();
    await service.handleTelegramWidgetCallback(
      req as never,
      res as never,
      widgetQuery(),
      '/account',
      'https://ios.vedamatch.com',
    );
    expect(res.redirect).toHaveBeenCalledWith(
      'https://ios.vedamatch.com/account',
    );
  });
});
