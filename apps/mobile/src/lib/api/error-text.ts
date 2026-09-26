import { ApiError } from './client';

/**
 * Текст ошибки для экрана — общий разбор на всё приложение.
 *
 * Экраны отдавали в интерфейс `e.message` как есть, и без сети человек читал
 * «fetch failed: java.net.UnknownHostException: Unable to resolve host
 * "api.vedamatch.ru": No address associated with hostname» (Realme, Android
 * 12, вкладка «Чаты»). Приём уже был у двух разделов по отдельности
 * (`services-error.ts`, `inbox-error.ts`); здесь он один для остальных.
 *
 * Правила:
 * - нет ответа сервера (обрыв, DNS, таймаут) — «Нет соединения с сервером.»;
 *   технические подробности остаются в логе (`logErrorDetails`), не на экране;
 * - `ApiError` 5xx и 429 — свои человеческие тексты, внутренности сервера
 *   наружу не идут;
 * - `ApiError` 4xx — текст сервера (он русский: «Беседа не найдена» и т. п.),
 *   без текста — запасной текст экрана;
 * - прочие `Error` — их текст: их бросает сам код приложения по-русски
 *   («Вход через Google недоступен внутри Telegram…»).
 */

export const NETWORK_ERROR_TEXT = 'Нет соединения с сервером. Проверьте интернет.';

/**
 * Признаки сетевого сбоя в тексте ошибки `fetch`. В React Native на Android
 * бывает и «Network request failed», и «fetch failed: java.net.…Exception»,
 * в браузере — «Failed to fetch» / «Load failed».
 */
const NETWORK_MESSAGE =
  /network request failed|fetch failed|failed to fetch|load failed|networkerror|unknownhost|unable to resolve host|no address associated|sockettimeout|timed? ?out|failed to connect|connection (refused|reset|abort)|econn|enotfound|ehostunreach|enetunreach|ssl|trust anchor/i;

/**
 * Ответа сервера нет вовсе: `fetch` бросил, а не вернул статус. `ApiError`
 * со статусом 0 клиент ставит сам, когда не вышло обновить токен из-за сети.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 0;
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return true;
  return NETWORK_MESSAGE.test(error.message);
}

export function errorText(error: unknown, fallback: string): string {
  if (isNetworkError(error)) return NETWORK_ERROR_TEXT;
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Сессия закончилась. Войдите снова.';
    if (error.status === 429) return 'Слишком много запросов. Подождите минуту и повторите.';
    if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
    return error.message || fallback;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

/**
 * Технические подробности — в лог, раз с экрана они убраны. Только
 * сетевые и 5xx: остальные тексты человек и так видит целиком.
 */
export function logErrorDetails(where: string, error: unknown): void {
  const serverSide = error instanceof ApiError && error.status >= 500;
  if (!isNetworkError(error) && !serverSide) return;
  // eslint-disable-next-line no-console
  console.warn(`[${where}]`, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}

/** Текст для экрана и подробности в лог одним вызовом. */
export function screenErrorText(where: string, error: unknown, fallback: string): string {
  logErrorDetails(where, error);
  return errorText(error, fallback);
}
