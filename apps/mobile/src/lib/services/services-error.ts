import { ApiError } from '@/lib/api/client';

/**
 * Текст ошибки загрузки каталога сервисов на русском (VED-174, раунд оценки
 * 007, дефект 3). Без этой функции голый `TypeError('Network request
 * failed')` от `fetch` в офлайне уходил прямо в интерфейс на английском.
 * Сетевой сбой (нет соединения) отличается от `ApiError` тем, что у него
 * нет ответа сервера вовсе — `request()` в `lib/api/client.ts` оборачивает
 * в `ApiError` только `!response.ok`, а сам `fetch` при обрыве сети бросает
 * обычную ошибку без статуса.
 */
export function describeServicesError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Сессия закончилась. Войдите снова.';
    if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
    return error.message || 'Не удалось загрузить сервисы.';
  }
  return 'Нет соединения с сервером.';
}
