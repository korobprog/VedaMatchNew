/**
 * Порядок записей в плейлисте. См. docs/music-service-plan.md, этап 4.
 *
 * Позиции разрежённые, а не 0,1,2,…: вставка в середину списка на полсотни
 * записей иначе переписывала бы весь хвост одной транзакцией на каждый
 * перенос. С шагом в тысячу между соседями помещается ещё девять вставок,
 * а когда зазор кончается — список перенумеровывается целиком, но это
 * редкий случай, а не каждый перенос.
 *
 * Модуль чистый и покрыт тестом отдельно от сервиса: ошибка здесь не падает,
 * а тихо путает порядок — человек замечает её через неделю на своём же
 * плейлисте.
 */

/** Зазор между соседями при обычной вставке в конец. */
export const POSITION_STEP = 1000;

/**
 * Минимальный зазор, при котором вставка ещё возможна. Между 5 и 6 нового
 * целого числа нет, и такой список надо перенумеровать.
 */
const MIN_GAP = 2;

/** Позиция для записи, добавляемой в конец. */
export function nextPosition(lastPosition: number | null): number {
  if (lastPosition === null || !Number.isFinite(lastPosition)) {
    return POSITION_STEP;
  }
  return Math.trunc(lastPosition) + POSITION_STEP;
}

/**
 * Позиция между двумя соседями. `null` с любой стороны — край списка.
 * Возвращает `null`, когда целого числа между соседями не осталось: зовущий
 * обязан перенумеровать список и повторить.
 */
export function positionBetween(
  before: number | null,
  after: number | null,
): number | null {
  if (before === null && after === null) return POSITION_STEP;
  if (before === null) return Math.trunc(after as number) - POSITION_STEP;
  if (after === null) return nextPosition(before);

  const low = Math.trunc(before);
  const high = Math.trunc(after);
  // Соседи в неверном порядке — это ошибка зовущего, а не край списка:
  // молча вернуть середину значит спрятать её до следующего переноса.
  if (high - low < MIN_GAP) return null;
  return low + Math.trunc((high - low) / 2);
}

/**
 * Новые позиции для списка целиком. Применяется, когда зазор кончился:
 * порядок сохраняется, зазоры восстанавливаются.
 */
export function renumber(count: number): number[] {
  const total = Math.max(0, Math.trunc(count));
  return Array.from(
    { length: total },
    (_, index) => (index + 1) * POSITION_STEP,
  );
}

/**
 * Куда встанет запись при переносе на место `toIndex` в списке `positions`,
 * упорядоченном по возрастанию. `null` — нужен `renumber`.
 *
 * `fromIndex` учитывается: запись, переезжающая вниз, освобождает своё место,
 * и без поправки она встаёт на одну позицию выше, чем показал человек.
 */
export function positionForMove(
  positions: number[],
  fromIndex: number,
  toIndex: number,
): number | null {
  const without = positions.filter((_, index) => index !== fromIndex);
  const target = Math.min(Math.max(0, toIndex), without.length);
  const before = target > 0 ? without[target - 1] : null;
  const after = target < without.length ? without[target] : null;
  return positionBetween(before, after);
}
