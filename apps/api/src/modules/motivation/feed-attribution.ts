/**
 * Фильтр ленты по автору и источнику (VED-206).
 *
 * Автор и источник лежат на посте свободной строкой — как их записала
 * генерация, редакция или участник. Одна и та же книга приходит как
 * «Бхагавад-гита», «бхагавад-гита » и «Бхагавад–гита»: сравнивать строки
 * напрямую значит показать в списке три Гиты и в ленте — треть каждой.
 * Поэтому и список, и фильтр сравнивают нормализованный ключ.
 */

/** Длиннее названия книги не бывает; длинный параметр — мусор. */
export const MAX_ATTRIBUTION_FILTER_LENGTH = 200;

/**
 * Ключ сравнения: регистр, «ё», виды тире и кавычек, лишние пробелы и точка
 * в конце не различаются.
 */
export function attributionKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/["«»„“”'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '')
    .trim();
}

/** Значение фильтра из адреса; пусто — фильтра нет. */
export function attributionFilter(
  raw: string | undefined | null,
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_ATTRIBUTION_FILTER_LENGTH) return null;
  return attributionKey(trimmed) || null;
}

/**
 * Какие из записанных в базе вариантов подходят под фильтр. Пустой список —
 * не подходит ничего, и лента честно пуста.
 */
export function matchingVariants(
  variants: readonly (string | null)[],
  key: string,
): string[] {
  return variants.filter(
    (variant): variant is string =>
      variant !== null && attributionKey(variant) === key,
  );
}

export interface AttributionOption {
  /** Как показать и что отправить в адрес. */
  label: string;
  count: number;
}

/**
 * Пункты списка: варианты одной строки склеены, счётчики сложены. Подпись —
 * самый частый вариант написания (при равенстве — первый по алфавиту), чтобы
 * список показывал ту форму, которую чаще видят на слайдах.
 */
export function buildAttributionOptions(
  rows: readonly { value: string | null; count: number }[],
): AttributionOption[] {
  const groups = new Map<
    string,
    { total: number; best: string; bestCount: number }
  >();
  for (const row of rows) {
    const label = row.value?.replace(/\s+/g, ' ').trim();
    if (!label || row.count <= 0) continue;
    const key = attributionKey(label);
    if (!key) continue;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { total: row.count, best: label, bestCount: row.count });
      continue;
    }
    group.total += row.count;
    if (
      row.count > group.bestCount ||
      (row.count === group.bestCount && label.localeCompare(group.best) < 0)
    ) {
      group.best = label;
      group.bestCount = row.count;
    }
  }
  return [...groups.values()]
    .map((group) => ({ label: group.best, count: group.total }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
}
