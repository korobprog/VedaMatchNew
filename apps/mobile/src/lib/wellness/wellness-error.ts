import { ApiError } from '@/lib/api/client';

/**
 * Ошибки сканера на русском (VED-335) — по образцу
 * `lib/services/services-error.ts`.
 *
 * Отдельный модуль, а не общий описатель, потому что у сканера свои исходы.
 * Главный из них — 404: «такого товара нет в базе» это НЕ поломка, и говорить
 * о нём «что-то пошло не так» значит отправить человека жать «Повторить» там,
 * где повторять нечего.
 *
 * Второй по важности — магазин без связи. Полки в подвалах, сеть там не ловит,
 * и человек должен понять, что дело в сети, а не в продукте.
 */

export type ScanFailureKind =
  /** Товара нет ни у нас, ни в Open Food Facts. Повторять бессмысленно. */
  | 'not-found'
  /** Нет сети. Повторять осмысленно — из подвала можно выйти. */
  | 'offline'
  /** Сервер ответил ошибкой. Повторять осмысленно. */
  | 'server'
  /** Код не прошёл проверку на сервере. Повторять нечего, нужен другой код. */
  | 'bad-barcode'
  | 'session'
  | 'unknown';

export interface ScanFailure {
  kind: ScanFailureKind;
  message: string;
  /** Показывать ли кнопку «Повторить»: кнопка, которая не помогает, злит. */
  retryable: boolean;
}

export function describeScanError(error: unknown): ScanFailure {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return {
        kind: 'not-found',
        message: 'Товара с таким штрихкодом пока нет в базе.',
        retryable: false,
      };
    }
    if (error.status === 400) {
      return {
        kind: 'bad-barcode',
        message: error.message || 'Штрихкод не распознан — проверьте цифры.',
        retryable: false,
      };
    }
    if (error.status === 401) {
      return {
        kind: 'session',
        message: 'Сессия закончилась. Войдите снова.',
        retryable: false,
      };
    }
    if (error.status === 429) {
      return {
        kind: 'server',
        message: 'Слишком много проверок подряд. Подождите минуту.',
        retryable: true,
      };
    }
    if (error.status >= 500) {
      // Текст сервера важнее нашего, когда он есть. Найдено живой проверкой
      // на A51: распознавание снимков отвечает 503 с объяснением
      // «Распознавание снимков не настроено — введите состав вручную», а мы
      // показывали вместо него бессмысленное «попробуйте позже» и отправляли
      // человека ждать того, что само не починится.
      return {
        kind: 'server',
        message: error.message || 'Сервер временно недоступен. Попробуйте позже.',
        retryable: true,
      };
    }
    return {
      kind: 'unknown',
      message: error.message || 'Не удалось проверить состав.',
      retryable: true,
    };
  }
  // `fetch` при обрыве связи бросает обычную ошибку без статуса — `ApiError`
  // клиент делает только из ответа сервера (`lib/api/client.ts`).
  return {
    kind: 'offline',
    message: 'Нет связи с сервером. В магазине это обычное дело — попробуйте у выхода.',
    retryable: true,
  };
}
