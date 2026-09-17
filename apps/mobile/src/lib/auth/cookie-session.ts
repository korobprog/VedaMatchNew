import type { SessionRefreshResult } from '@/lib/api/client';
import type { LoginProvider } from './login-flow';
import { singleFlight } from './single-flight';

/**
 * Сессия веб-версии приложения (`ios.vedamatch.com`). Токенов в JS нет:
 * вход, обновление и выход идут маршрутами сайта, а пара токенов живёт в
 * httpOnly cookie на домене портала (`.vedamatch.com`) — той же, что у
 * `vedamatch.com`. Чистые функции: `session.web.tsx` только склеивает их с
 * React и браузером.
 */

/**
 * Путь возврата — только внутренний: сервер всё равно пропустит его через
 * `safeReturnTo`, но собирать заведомо плохой адрес незачем.
 */
function internalPath(path: string): string {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/';
}

export function buildWebLoginUrl(
  apiOrigin: string,
  provider: LoginProvider,
  returnOrigin: string,
  returnTo: string,
): string {
  const url = new URL(`${apiOrigin.replace(/\/+$/, '')}/auth/${provider}`);
  url.searchParams.set('returnOrigin', returnOrigin);
  url.searchParams.set('returnTo', internalPath(returnTo));
  return url.toString();
}

async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string' && body.message) return body.message;
  } catch {
    // Тело не JSON — ниже общий текст.
  }
  return `Сервер ответил кодом ${response.status}`;
}

export function createCookieAuthApi(apiOrigin: string, fetchImpl: typeof fetch = fetch) {
  const base = apiOrigin.replace(/\/+$/, '');
  const post = (path: string, body?: unknown) =>
    fetchImpl(`${base}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // Ротация refresh на сервере одноразовая: два параллельных обновления из
  // одной вкладки сервер прочитал бы как повторное предъявление.
  const refresh = singleFlight(async (): Promise<SessionRefreshResult> => {
    let response: Response;
    try {
      response = await post('/auth/refresh');
    } catch {
      return { kind: 'unavailable' };
    }
    if (response.ok) return { kind: 'refreshed', accessToken: '' };
    if (response.status === 401 || response.status === 403) return { kind: 'rejected' };
    return { kind: 'unavailable' };
  });

  return {
    refresh,
    async logout(): Promise<void> {
      await post('/auth/logout').catch(() => undefined);
    },
    async devLogin(email: string, password: string): Promise<void> {
      const response = await post('/auth/dev-login', { email, password });
      if (!response.ok) throw new Error(await messageOf(response));
    },
  };
}

export type CookieAuthApi = ReturnType<typeof createCookieAuthApi>;
