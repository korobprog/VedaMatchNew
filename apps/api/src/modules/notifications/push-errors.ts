export type PushFailure = 'gone' | 'rate-limited' | 'transient';

/**
 * Браузеры отзывают подписки постоянно: переустановка, очистка данных, долгое
 * бездействие. Без удаления мёртвых строк таблица зарастает, а каждая рассылка
 * ждёт по ним таймаутов.
 */
export function classifyPushError(statusCode: number | undefined): PushFailure {
  if (statusCode === 404 || statusCode === 410 || statusCode === 400) {
    return 'gone';
  }
  if (statusCode === 429) return 'rate-limited';
  return 'transient';
}
