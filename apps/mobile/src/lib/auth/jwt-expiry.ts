/**
 * Срок жизни access-токена по его полю `exp`.
 *
 * Подпись здесь не проверяется и не должна: токен выдал наш API, и доверять
 * ему клиент всё равно не может. Срок нужен только затем, чтобы обновить
 * токен заранее, а не ловить 401 посреди отправки сообщения.
 */

function decodeBase64Url(part: string): string {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

/** Момент истечения в миллисекундах или `null`, если токен не читается. */
export function readJwtExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(parts[1]));
    if (typeof payload !== 'object' || payload === null) return null;
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Сколько ждать до обновления. Ноль — обновлять сейчас: токена нет, он не
 * читается или истечёт раньше, чем пройдёт запас на медленную сеть.
 */
export function msUntilRefresh(
  token: string | null,
  nowMs: number,
  skewMs = 60_000,
): number {
  if (!token) return 0;
  const expiry = readJwtExpiryMs(token);
  if (expiry === null) return 0;
  return Math.max(0, expiry - skewMs - nowMs);
}
