import { ApiError } from '@/lib/api/client';

/**
 * Ошибки поддержки на русском (VED-336), по образцу
 * `lib/services/services-error.ts`.
 *
 * Свой модуль, потому что у поддержки свой главный исход — лимит: создание
 * обращения сервер пускает не чаще пяти раз в час, ответ в переписке — не
 * чаще тридцати. «Повторить» в эту минуту бесполезна, и человеку надо
 * сказать, когда получится, а не «что-то пошло не так».
 */
export type SupportAction = 'load' | 'create' | 'reply';

export interface SupportFailure {
  message: string;
  /** Показывать ли «Повторить»: кнопка, которая не поможет, только злит. */
  retryable: boolean;
}

export function describeSupportError(error: unknown, action: SupportAction): SupportFailure {
  if (error instanceof ApiError) {
    if (error.status === 401) return { message: 'Сессия закончилась. Войдите снова.', retryable: false };
    if (error.status === 404) {
      return { message: 'Обращение не найдено — возможно, оно создано под другим аккаунтом.', retryable: false };
    }
    if (error.status === 429) {
      return {
        message:
          action === 'create'
            ? 'Обращений за час уже пять — это предел. Допишите в уже открытое обращение или попробуйте через час.'
            : 'Слишком много сообщений подряд. Подождите немного и отправьте снова.',
        retryable: false,
      };
    }
    // 400 — сервер уже сказал по-человечески, что не так («Заполните тему…»).
    if (error.status === 400) return { message: error.message || 'Проверьте поля формы.', retryable: false };
    if (error.status >= 500) return { message: 'Сервер поддержки временно недоступен. Попробуйте позже.', retryable: true };
    return { message: error.message || 'Не получилось. Попробуйте ещё раз.', retryable: true };
  }
  return {
    message:
      action === 'load'
        ? 'Нет соединения с сервером. Проверьте интернет.'
        : 'Нет соединения с сервером — текст сохранён, отправьте снова, когда появится сеть.',
    retryable: true,
  };
}
