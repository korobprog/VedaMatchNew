import { randomBytes } from 'node:crypto';

/**
 * Токен привязки гостевой заявки. Гость с QR-страницы оставил заявку без
 * аккаунта; токен лежит у него в браузере, и после входа заявка переходит в
 * его кабинет. Это единственный ключ к заявке, поэтому 24 случайных байта
 * из crypto: перебором такой не подобрать.
 */
const TOKEN_BYTES = 24;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function generateClaimToken(
  bytes: (size: number) => Buffer = randomBytes,
): string {
  return bytes(TOKEN_BYTES).toString('base64url');
}

/** Токен из запроса или null — без обрезки и без исправлений. */
export function normalizeClaimToken(value: unknown): string | null {
  return typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;
}
