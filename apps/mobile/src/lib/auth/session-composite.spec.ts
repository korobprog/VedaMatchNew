/**
 * Композитный тест на границе `client.ts` ↔ `token-authority.ts`
 * (`gan-harness/feedback/feedback-003.md`, блокирующий п.1/3). Все
 * предыдущие тесты либо мокали `session.refresh` целиком
 * (`client.spec.ts`), либо гоняли `token-authority` в полной изоляции
 * (`token-authority.spec.ts`) — ни один не проверял их ВМЕСТЕ, в реальной
 * композиции, ровно как их соединяет `session.tsx`:
 * `session: { getAccessToken: () => authority.getAccessToken(), refresh:
 * authority.refresh }`. Именно на этой границе и жила регрессия из
 * `feedback-003.md` — обе стороны были корректны и протестированы
 * по отдельности, дыра была только в их совместной работе.
 *
 * Мок только на уровне `token-store` (как в `token-authority.spec.ts`) —
 * `createApiClient` и `createTokenAuthority` здесь настоящие, без единого
 * мока их собственной логики.
 */
import { createApiClient, type ApiClient } from '@/lib/api/client';
import { createTokenAuthority, type TokenAuthority } from './token-authority';

const store = {
  tokens: null as { accessToken: string; refreshToken: string } | null,
};

jest.mock('@/config/app-variant', () => ({
  appVariant: () => ({ apiOrigin: 'https://api.example', contour: 'ru', channel: 'site' }),
}));

jest.mock('./token-store', () => ({
  readTokens: async () => store.tokens,
  writeTokens: async (pair: { accessToken: string; refreshToken: string }) => {
    store.tokens = pair;
  },
  clearTokens: async () => {
    store.tokens = null;
  },
}));

function fakeAuthApi(refresh: (refreshToken: string) => Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}>) {
  return { exchangeCode: jest.fn(), refresh: jest.fn(refresh), devLogin: jest.fn(), logout: jest.fn() };
}

/** Собирает пару client+authority так же, как `session.tsx`: `refresh`
 *  передаётся напрямую, без обёртки. */
function wire(
  authApi: ReturnType<typeof fakeAuthApi>,
  fetchImpl: typeof fetch,
  onSessionExpired?: () => void,
): { api: ApiClient; authority: TokenAuthority } {
  const authority = createTokenAuthority({ authApi });
  const api = createApiClient({
    baseUrl: 'https://api.example',
    fetchImpl,
    session: { getAccessToken: () => authority.getAccessToken(), refresh: authority.refresh },
    onSessionExpired,
  });
  return { api, authority };
}

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('client.ts + token-authority.ts в composition (как их соединяет session.tsx)', () => {
  beforeEach(() => {
    store.tokens = { accessToken: 'access-old', refreshToken: 'refresh-old' };
  });

  it('refresh отвечает 502 — onSessionExpired НЕ вызван, токены в хранилище целы', async () => {
    const authApi = fakeAuthApi(async () => {
      throw Object.assign(new Error('bad gateway'), { status: 502 });
    });
    const fetchImpl = jest.fn(async () => json(401, { message: 'Unauthorized' }));
    const onSessionExpired = jest.fn();
    const { api } = wire(authApi, fetchImpl, onSessionExpired);

    await expect(api.request('/users/me')).rejects.toMatchObject({ status: 0 });
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(store.tokens).toEqual({ accessToken: 'access-old', refreshToken: 'refresh-old' });
    // Только исходный запрос — повтора тем же уже отвергнутым токеном не было.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refresh отвечает 401 — onSessionExpired вызван, токены стёрты', async () => {
    const authApi = fakeAuthApi(async () => {
      throw Object.assign(new Error('revoked'), { status: 401 });
    });
    const fetchImpl = jest.fn(async () => json(401, { message: 'Unauthorized' }));
    const onSessionExpired = jest.fn();
    const { api } = wire(authApi, fetchImpl, onSessionExpired);

    await expect(api.request('/users/me')).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(store.tokens).toBeNull();
  });

  it('refresh сначала 502, потом 200 — второй запрос проходит после повтора', async () => {
    let attempt = 0;
    const authApi = fakeAuthApi(async (refreshToken) => {
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error('bad gateway'), { status: 502 });
      expect(refreshToken).toBe('refresh-old'); // токен не менялся между попытками
      return { accessToken: 'access-new', refreshToken: 'refresh-new', expiresIn: 900, refreshExpiresIn: 2_592_000 };
    });
    const fetchImpl = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer access-new' ? json(200, { id: 'me-1' }) : json(401, {});
    });
    const onSessionExpired = jest.fn();
    const { api } = wire(authApi, fetchImpl, onSessionExpired);

    // Первая попытка: /auth/app/refresh временно недоступен — сетевая ошибка,
    // сессия не тронута.
    await expect(api.request('/users/me')).rejects.toMatchObject({ status: 0 });
    expect(onSessionExpired).not.toHaveBeenCalled();

    // Сервер снова жив — тот же вызывающий код повторяет запрос сам (как
    // экран «Повторить» в приложении); токены ещё те же, обмен проходит.
    await expect(api.request('/users/me')).resolves.toEqual({ id: 'me-1' });
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(store.tokens).toEqual({ accessToken: 'access-new', refreshToken: 'refresh-new' });
  });
});
