/**
 * Почему ИИ-проверка не состоялась — словами, понятными администратору.
 *
 * В аудит раньше писалось только «сбой модели», и по такой записи нельзя было
 * решить главное: ждать и повторить или разбирать текст руками. А сбои разные:
 * апстрим провайдера лёг на минуту (503), кончилась квота, порвался ответ.
 *
 * Текст ошибки провайдера в интерфейс не выносим целиком — там request id и
 * название чужого канала; в аудите он остаётся полностью, а человеку
 * показывается короткая строка.
 */

export type AiFailureKind =
  | 'provider_unavailable'
  | 'rate_limited'
  | 'timeout'
  | 'bad_response'
  | 'unknown';

const MESSAGES: Record<AiFailureKind, string> = {
  provider_unavailable:
    'Провайдер модели временно недоступен — можно повторить проверку',
  rate_limited:
    'Провайдер ограничил частоту запросов — можно повторить проверку',
  timeout: 'Модель не ответила вовремя — можно повторить проверку',
  bad_response: 'Модель ответила неразборчиво — можно повторить проверку',
  unknown: 'Модель не смогла проверить текст',
};

/** Повторять есть смысл у всего, кроме неизвестного сбоя. */
export function isRetryableFailure(kind: AiFailureKind): boolean {
  return kind !== 'unknown';
}

export function classifyAiFailure(error: unknown): AiFailureKind {
  const text = (
    error instanceof Error ? error.message : String(error ?? '')
  ).toLowerCase();
  if (!text) return 'unknown';
  if (
    text.includes('503') ||
    text.includes('502') ||
    text.includes('upstream_unavailable') ||
    text.includes('unavailable')
  )
    return 'provider_unavailable';
  if (text.includes('429') || text.includes('rate limit')) return 'rate_limited';
  if (text.includes('timeout') || text.includes('timed out')) return 'timeout';
  if (
    text.includes('json') ||
    text.includes('parse') ||
    text.includes('invalid') ||
    // Провайдер отвечает 200 с пустым телом — видели на своём же релее.
    text.includes('no content') ||
    text.includes('returned no') ||
    text.includes('empty')
  )
    return 'bad_response';
  return 'unknown';
}

/** Короткая причина для администратора. */
export function aiFailureReason(error: unknown): string {
  return MESSAGES[classifyAiFailure(error)];
}
