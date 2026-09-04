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
  return orderIngestEntries(entries).map((entry) => entry.ref);
}

/**
 * То же самое, но записями, а не именами.
 *
 * Нужно там, где имена не различают записи: в одной партии бывает два
 * одинаковых `01.mp3` — из двух архивов или из одного, залитого дважды. По
 * списку имён такие две записи не развести, и порядок для одной из них
 * достаётся другой.
 */
export function orderIngestEntries<T extends IngestOrderEntry>(
  entries: readonly T[],
): T[] {
  // Копия: сортировать переданный массив на месте — сюрприз для зовущего.
  return [...entries].sort((a, b) => {
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
  });
}

/** Позиция партии, которую разбор архива может переставить. */
export interface IngestPositionedEntry extends IngestOrderEntry {
  id: string;
  position: number;
}

export interface IngestPositionChange {
  id: string;
  position: number;
}

/**
 * Что переписать в `position`, чтобы позиции встали в порядке альбома.
 *
 * Переставляем только между теми местами, которые эти позиции уже занимают:
 * партия бывает смешанной — часть залита файлами, часть добавлена ссылками,
 * — и разбор архива не имеет права двигать чужие строки.
 *
 * Возвращаются только изменения. Пустой список означает «порядок уже верный»
 * и избавляет от транзакции на каждом обновлении статуса партии: он
 * пересчитывается после каждой обработанной позиции.
 */
export function planIngestReorder(
  items: readonly IngestPositionedEntry[],
): IngestPositionChange[] {
  if (items.length < 2) return [];

  const slots = items.map((item) => item.position).sort((a, b) => a - b);

  const changes: IngestPositionChange[] = [];
  orderIngestEntries(items).forEach((item, at) => {
    const position = slots[at];
    if (item.position !== position) changes.push({ id: item.id, position });
  });

  return changes;
}
