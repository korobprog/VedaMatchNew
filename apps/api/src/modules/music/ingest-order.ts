/**
 * Порядок дорожек в партии.
 *
 * Отдельным чистым модулем по той же причине, что и `playlist-order.ts`:
 * ошибка здесь не падает, а тихо путает порядок — человек замечает её уже на
 * опубликованной подборке.
 */

export interface IngestOrderEntry {
  /** Чем позиция называется у зовущего: имя записи архива или её id. */
  ref: string;
  /** Номер дорожки из тегов файла; `null` — тега не было. */
  trackNumber: number | null;
}

/**
 * Естественное сравнение имён: `track2` раньше `track10`, а не наоборот, как
 * дала бы посимвольная сортировка. Локаль русская, потому что в именах
 * записей регулярно встречается кириллица.
 */
function compareRefs(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

/** Номер дорожки, если ему можно верить. Ноль и дробь тегом не считаются. */
function usableNumber(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.trunc(value);
  return rounded > 0 ? rounded : null;
}

/**
 * Порядок дорожек: сначала те, у кого есть номер из тегов, по возрастанию;
 * затем остальные по именам.
 *
 * Номер важнее имени, потому что тег ставил тот, кто выпускал запись, а имя
 * файла — тот, кто её перекладывал. Записи без номера уходят в хвост, а не
 * вперемешку: иначе одна дорожка без тега вклинивалась бы в середину альбома
 * по случайному совпадению имени.
 */
export function sortIngestEntries(
  entries: readonly IngestOrderEntry[],
): string[] {
  // Копия: сортировать переданный массив на месте — сюрприз для зовущего.
  return [...entries]
    .sort((a, b) => {
      const left = usableNumber(a.trackNumber);
      const right = usableNumber(b.trackNumber);

      if (left !== null && right !== null) {
        // Равные номера разводятся по имени, а не остаются на волю
        // сортировки: у половины сборников все дорожки помечены единицей.
        return left === right ? compareRefs(a.ref, b.ref) : left - right;
      }
      if (left !== null) return -1;
      if (right !== null) return 1;
      return compareRefs(a.ref, b.ref);
    })
    .map((entry) => entry.ref);
}
