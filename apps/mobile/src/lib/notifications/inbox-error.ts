import { ApiError } from '@/lib/api/client';

/**
 * Текст ошибки ленты уведомлений по-русски (VED-330, раунд оценки 001,
 * дефект 2).
 *
 * Первый заход отдавал в интерфейс `e.message` как есть, и в офлайне человек
 * читал на экране «fetch failed: java.net.UnknownHostException: Unable to
 * resolve host "api.vedamatch.ru": No address associated with hostname»
 * (снимок `ved330-09-offline-raw-error.png`). На соседней вкладке «Сервисы»
 * тот же случай давно говорит «Нет соединения с сервером» — приём в
 * репозитории уже был (`lib/services/services-error.ts`), просто не
 * применён здесь.
 *
 * Отдельный модуль, а не вызов чужого: тексты у разделов свои («не удалось
 * загрузить уведомления», а не «сервисы»), и импортировать формулировки
 * соседнего раздела ради двух общих веток — способ однажды показать
 * человеку не то слово.
 *
 * Сетевой сбой отличается от `ApiError` тем, что ответа сервера нет вовсе:
 * `request()` в `lib/api/client.ts` заворачивает в `ApiError` только
 * `!response.ok`, а `fetch` при обрыве сети бросает обычную ошибку без
 * статуса. `ApiError(0, …)` оттуда же — «нет связи», её текст уже русский и
 * сохраняется как есть.
 */

/** Что случилось при загрузке первой порции. */
export function describeInboxError(error: unknown): string {
  return describe(error, 'Не удалось загрузить уведомления.');
}

/** То же для кнопки «Показать ещё»: беда та же, а действие другое. */
export function describeInboxMoreError(error: unknown): string {
  return describe(error, 'Не удалось загрузить продолжение.');
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    // `status: 0` ставит сам клиент, когда обновить сессию не вышло из-за
    // сети; текст там уже человеческий и подробнее общего.
    if (error.status === 0) return error.message || 'Нет соединения с сервером.';
    if (error.status === 401) return 'Сессия закончилась. Войдите снова.';
    if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
    return error.message || fallback;
  }
  return 'Нет соединения с сервером.';
}
