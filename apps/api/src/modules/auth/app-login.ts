import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Вход мобильного приложения через аккаунт VedaMatch.
 *
 * Веб получает сессию в cookie с редиректом на портал. У приложения cookie
 * нет, поэтому колбэк Google или Яндекса отдаёт ему одноразовый код через
 * адрес `vedamatch://auth`, а пару токенов приложение забирает отдельным
 * запросом, предъявив PKCE-верификатор. Схему `vedamatch://` может
 * перехватить чужое приложение на телефоне; без верификатора, который
 * никогда не покидал наше приложение, украденный код бесполезен.
 */

/**
 * Куда колбэк вправе вернуть код. Список закрытый: адрес приходит в query от
 * клиента, и произвольный адрес превратил бы вход в выдачу кода кому угодно.
 */
export const APP_REDIRECT_URIS: readonly string[] = ['vedamatch://auth'];

/** RFC 7636: верификатор 43–128 символов из unreserved-алфавита. */
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
/** base64url от SHA-256 — ровно 43 символа без выравнивания. */
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export const APP_LOGIN_CODE_TTL_MS = 60_000;

export interface AppLoginRequest {
  redirect: string;
  challenge: string;
}

export class AppLoginRequestError extends Error {}

/**
 * Параметры входа из приложения. Оба отсутствуют — это обычный вход с сайта,
 * `null`. Один из двух или кривое значение — ошибка, а не молчаливый откат на
 * веб-вход: иначе приложение открыло бы портал вместо возврата к себе.
 */
export function parseAppLoginRequest(query: {
  appRedirect?: unknown;
  appChallenge?: unknown;
}): AppLoginRequest | null {
  const redirect = query.appRedirect;
  const challenge = query.appChallenge;
  if (redirect === undefined && challenge === undefined) return null;
  if (typeof redirect !== 'string' || !APP_REDIRECT_URIS.includes(redirect)) {
    throw new AppLoginRequestError('Недопустимый адрес возврата в приложение');
  }
  if (typeof challenge !== 'string' || !CHALLENGE_RE.test(challenge)) {
    throw new AppLoginRequestError('Недопустимый PKCE challenge');
  }
  return { redirect, challenge };
}

export function pkceChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Сравнение постоянного времени: challenge хранится у нас, верификатор приходит снаружи. */
export function verifyPkceS256(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !VERIFIER_RE.test(verifier)) return false;
  const actual = Buffer.from(pkceChallengeS256(verifier));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Возврат в приложение с кодом или с текстом ошибки для экрана входа. */
export function appRedirectUrl(
  redirect: string,
  params: { code: string } | { error: string },
): string {
  const url = new URL(redirect);
  if ('code' in params) url.searchParams.set('code', params.code);
  else url.searchParams.set('error', params.error.slice(0, 200));
  return url.toString();
}
