import type { ManifestFailureKind } from './self-update-client';

/**
 * Тексты отказа проверки обновления (VED-176, итерация 2). Итерация 1 на всё
 * говорила «Не получилось проверить обновление, повторите» — в том числе
 * когда повторять бессмысленно (адрес не зашит в сборку). Чистая функция:
 * какой текст и есть ли смысл в кнопке «Повторить».
 */
export type CheckFailureKind = ManifestFailureKind | 'version-unknown';

export interface CheckFailureText {
  message: string;
  /** Показывать ли «Повторить»: для ошибок сборки повтор ничего не изменит. */
  retryable: boolean;
}

export function checkFailureText(kind: CheckFailureKind): CheckFailureText {
  switch (kind) {
    case 'not-configured':
      return {
        message:
          'Адрес обновлений не настроен в этой сборке. Новую версию можно скачать на сайте, в разделе «Приложение».',
        retryable: false,
      };
    case 'version-unknown':
      return {
        message: 'Не удалось определить версию установленного приложения, проверка невозможна.',
        retryable: false,
      };
    case 'network':
      return {
        message: 'Сервер обновлений не отвечает. Проверьте интернет и повторите.',
        retryable: true,
      };
    case 'not-found':
      return {
        message: 'Для этой сборки на сервере пока нет опубликованной версии.',
        retryable: true,
      };
    case 'malformed':
      return {
        message: 'Сервер обновлений прислал непонятный ответ. Повторите позже.',
        retryable: true,
      };
  }
}
