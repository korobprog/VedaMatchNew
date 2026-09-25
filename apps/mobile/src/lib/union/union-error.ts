import { ApiError } from '@/lib/api/client';

/**
 * Ошибки Знакомств по-русски.
 *
 * Сервис Знакомств, в отличие от блога, отвечает не кодами, а готовыми
 * фразами («Внимание уже активно», «Суперлайки на сегодня закончились») — их
 * и показываем как есть: пересказывать своими словами значило бы завести
 * второй текст на то же правило. Но у Nest есть и свои ответы по умолчанию
 * на английском («Not Found», «Forbidden resource») — их человеку не
 * показываем, вместо них идёт `fallback` с тем, что именно не вышло.
 */
export function describeUnionError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    // Статус 0 ставит сам клиент, когда сеть не дала обновить сессию.
    if (error.status === 0) return error.message || 'Нет соединения с сервером.';
    if (error.status === 401) return 'Сессия закончилась. Войдите снова.';
    if (error.status === 429) return 'Слишком часто. Подождите немного и повторите.';
    if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
    return /[А-Яа-яЁё]/.test(error.message) ? error.message : fallback;
  }
  return 'Нет соединения с сервером.';
}

/** 404 выдачи — у человека ещё нет анкеты (`union-profile.service.ts`). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
