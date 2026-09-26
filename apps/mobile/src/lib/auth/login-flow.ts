/**
 * Адреса входа через аккаунт VedaMatch и разбор возврата в приложение.
 * Чистые функции: экран входа и сессия только склеивают их с браузером.
 */

export type LoginProvider = 'google' | 'yandex';

/**
 * Возврат боевой сборки. У сборки разработчика своя схема —
 * `vedamatch-dev://auth` (`config/build-kind.ts`); какой адрес у этой
 * сборки, говорит `appAuthRedirect()` из `config/app-variant.ts`.
 */
export const APP_AUTH_REDIRECT = 'vedamatch://auth';

export function buildLoginUrl(
  apiOrigin: string,
  provider: LoginProvider,
  challenge: string,
  redirect: string = APP_AUTH_REDIRECT,
): string {
  const url = new URL(`${apiOrigin.replace(/\/+$/, '')}/auth/${provider}`);
  url.searchParams.set('app_redirect', redirect);
  url.searchParams.set('app_challenge', challenge);
  return url.toString();
}

export type AuthRedirectResult =
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'invalid' };

/**
 * Разбор адреса, с которым браузер вернулся в приложение. Адрес пришёл
 * снаружи: чужое приложение может открыть `vedamatch://auth` с чем угодно,
 * поэтому всё, кроме ровно нашего адреса с кодом или ошибкой, — `invalid`.
 */
export function parseAuthRedirect(raw: string, redirect: string = APP_AUTH_REDIRECT): AuthRedirectResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: 'invalid' };
  }
  // Node на сервере сериализует `vedamatch://auth?x` как `vedamatch://auth/?x`:
  // косая после хоста это тот же адрес.
  const pathname = url.pathname === '/' ? '' : url.pathname;
  if (`${url.protocol}//${url.host}${pathname}` !== redirect) {
    return { kind: 'invalid' };
  }
  const code = url.searchParams.get('code');
  if (code && code.length <= 128) return { kind: 'code', code };
  const error = url.searchParams.get('error');
  if (error) return { kind: 'error', message: error.slice(0, 200) };
  return { kind: 'invalid' };
}
