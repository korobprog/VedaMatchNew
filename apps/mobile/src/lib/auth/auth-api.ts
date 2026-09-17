import type { TokenPair } from './token-store';

/**
 * Запросы входа к API. Отдельно от общего клиента: они сами работают с
 * refresh-токеном и не должны уходить в цикл «401 → обновиться».
 */

export interface AppTokens extends TokenPair {
  expiresIn: number;
  refreshExpiresIn: number;
}

export class AuthRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthRequestError';
  }
}

export function isAppTokens(value: unknown): value is AppTokens {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === 'string' &&
    v.accessToken.length > 0 &&
    typeof v.refreshToken === 'string' &&
    v.refreshToken.length > 0 &&
    typeof v.expiresIn === 'number' &&
    typeof v.refreshExpiresIn === 'number'
  );
}

async function post(
  fetchImpl: typeof fetch,
  apiOrigin: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiOrigin.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError(0, 'Нет связи с сервером. Проверьте интернет.');
  }
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string'
        ? (parsed as { message: string }).message
        : `Сервер ответил кодом ${response.status}`;
    throw new AuthRequestError(response.status, message);
  }
  return parsed;
}

async function tokens(promise: Promise<unknown>): Promise<AppTokens> {
  const value = await promise;
  if (!isAppTokens(value)) throw new AuthRequestError(502, 'Сервер вернул неожиданный ответ');
  return value;
}

export function createAuthApi(apiOrigin: string, fetchImpl: typeof fetch = fetch) {
  return {
    exchangeCode: (code: string, codeVerifier: string) =>
      tokens(post(fetchImpl, apiOrigin, '/auth/app/token', { code, codeVerifier })),
    refresh: (refreshToken: string) =>
      tokens(post(fetchImpl, apiOrigin, '/auth/app/refresh', { refreshToken })),
    devLogin: (email: string, password: string) =>
      tokens(post(fetchImpl, apiOrigin, '/auth/app/dev-login', { email, password })),
    logout: (refreshToken: string) =>
      post(fetchImpl, apiOrigin, '/auth/app/logout', { refreshToken }).then(() => undefined),
    /**
     * Вход мини-приложения Telegram в режиме токенов (`mode: 'token'`) — та же
     * проверка данных запуска, что и у cookie-режима (`createCookieAuthApi.
     * telegramLogin`), но ответ — пара токенов в теле, без единой cookie.
     * Только для веб-версии, открытой внутри Telegram Desktop/web.telegram.org:
     * там мини-приложение живёт в `<iframe>` на чужом происхождении, и cookie
     * портала как третьесторонняя браузером режется (см. `session.web.tsx`).
     */
    loginWithTelegram: (initData: string) =>
      tokens(post(fetchImpl, apiOrigin, '/auth/telegram/webapp', { initData, mode: 'token' })),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
