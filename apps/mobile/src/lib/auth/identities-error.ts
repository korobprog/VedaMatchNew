import { ApiError } from '@/lib/api/client';

/**
 * Текст ошибки экрана «Аккаунт и способы входа» на русском — тот же приём,
 * что у `services-error.ts`: сетевой сбой (нет ответа сервера вовсе)
 * отличается от `ApiError`, а 400/409 от `DELETE /auth/identities/:provider`
 * и `POST /auth/telegram/link` уже несут понятный русский текст с сервера
 * («последний способ входа», «уже привязан к другому аккаунту») — его и
 * показываем как есть.
 */
export function describeIdentitiesError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Сессия закончилась. Войдите снова.';
    if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
    return error.message || 'Не удалось выполнить действие.';
  }
  return 'Нет соединения с сервером.';
}
