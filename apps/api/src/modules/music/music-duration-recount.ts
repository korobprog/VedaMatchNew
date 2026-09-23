/**
 * Сверка длительности записи с файлом целиком (VED-310).
 *
 * При загрузке сервис читает только первый мегабайт (`METADATA_PREFIX_BYTES`)
 * и, когда разбор тегов длительности не дал, считает её по размеру и
 * битрейту первого кадра (`music-duration-estimate.ts`). У MP3 с переменным
 * битрейтом без заголовка Xing первый кадр — тишина вступления на 32 кбит/с,
 * и пятиминутный киртан получает «больше получаса». Отсюда жалоба VED-165.
 *
 * Фоновая стадия дочитывает файл до конца (`parseStream` c `duration: true`
 * пересчитывает кадры), а здесь решается, что делать с ответом. Чистым
 * модулем и под тестом: это единственное место стадии, где есть решения.
 */

/**
 * Потолок правдоподобной длительности. Загрузка принимает до четырёх часов
 * (`MUSIC_MAX_DURATION_SECONDS`); сутки — заведомо сбой разбора, а не запись,
 * и ставить такое число в каталог нельзя.
 */
export const MAX_PLAUSIBLE_DURATION_SECONDS = 24 * 60 * 60;

export type DurationRecountDecision =
  | { kind: 'update'; seconds: number }
  | { kind: 'keep' }
  | { kind: 'unreadable' };

export function decideRecountedDuration(input: {
  /** Что вернул разбор всего файла, секунды. */
  parsedSeconds: number | null | undefined;
  /** Что сейчас записано у записи. */
  currentSeconds: number;
}): DurationRecountDecision {
  const parsed = input.parsedSeconds;
  if (
    typeof parsed !== 'number' ||
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > MAX_PLAUSIBLE_DURATION_SECONDS
  ) {
    // Не прочиталось — прежнее число остаётся: оценка хуже точного, но
    // лучше нуля, а ноль у записи сломал бы плеер и сумму подборки.
    return { kind: 'unreadable' };
  }

  const seconds = Math.max(1, Math.round(parsed));
  return seconds === input.currentSeconds
    ? { kind: 'keep' }
    : { kind: 'update', seconds };
}
