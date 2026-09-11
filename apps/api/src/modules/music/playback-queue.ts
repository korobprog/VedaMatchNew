/**
 * Очередь плеера, присланная клиентом (VED-88): что сохранить и в каком
 * порядке отдать обратно.
 *
 * Чистый модуль: разбор тела запроса и восстановление порядка проверяются
 * тестом, база — в `MusicPlaybackService`.
 */

/**
 * Больше очередь не бывает: самая длинная подборка каталога — пара сотен
 * записей, а тысяча идентификаторов на каждое сохранение — лишний вес.
 */
export const PLAYBACK_QUEUE_MAX = 500;

const TRACK_ID = /^[0-9a-f-]{8,64}$/i;

/**
 * `undefined` — очередь не прислали, хранимую не трогать: позиция
 * сохраняется часто, а очередь меняется редко, и каждое сохранение позиции
 * без очереди иначе стирало бы её. Массив — сохранить, отбросив мусор.
 */
export function normalizePlaybackQueue(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((id): id is string => typeof id === 'string' && TRACK_ID.test(id))
    .slice(0, PLAYBACK_QUEUE_MAX);
}

/**
 * Хранимая очередь без записей, которых больше нет, — в её же порядке.
 * Запрос `id IN (…)` порядок не сохраняет, а очередь без порядка — не очередь.
 */
export function keepExistingInOrder(
  queue: readonly string[],
  existing: ReadonlySet<string>,
): string[] {
  return queue.filter((id) => existing.has(id));
}
