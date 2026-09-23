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

/**
 * Номер стиха в конце названия книги: «2.11», «1.2.12», «2.42-43», «2:62»,
 * можно с пометкой «БГ», «ШБ», «гл.», «текст». Без точки или двоеточия
 * число номером не считается: «Псалом 23» — это название, а не стих.
 */
const TRAILING_LOCATOR =
  /^(.*?\S)[\s,]+(?:(?:бг|шб|чч|гл\.?|глава|стих|текст)\.?\s*)?(\d+(?:[.:]\d+)+(?:\s*[-‐‑‒–—]\s*\d+)?)\s*\.?$/iu;

/**
 * Номер словами: «Бхагавад-гита, глава 2, стих 62» (VED-389). Такую запись
 * оставляют руками, и без разбора стих уходил в конец ленты источника.
 */
const TRAILING_WORDED_LOCATOR =
  /^(.*?\S)[\s,]+(?:глава|гл\.)\s*(\d+)[\s,.]+(?:стих|текст|шлока|шл\.)\s*(\d+(?:\s*[-‐‑‒–—]\s*\d+)?)\s*\.?$/iu;

/**
 * Книга и номер стиха из строки источника.
 *
 * На проде номер часто записан прямо в источник — «Бхагавад-гита 2.11» при
 * пустом локаторе. Без разбора каждый стих становится отдельной книгой:
 * список фильтра показывает двадцать «Гит» по одной записи, а порядок стихов
 * сравнивать не с чем (VED-206, VED-125).
 */
export function splitWorkLocator(value: string | null | undefined): {
  work: string;
  locator: string | null;
} {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  const worded = TRAILING_WORDED_LOCATOR.exec(text);
  if (worded)
    return {
      work: worded[1].replace(/[\s,]+$/, ''),
      locator: `${worded[2]}.${worded[3].replace(/\s+/g, '')}`,
    };
  const match = TRAILING_LOCATOR.exec(text);
  if (!match) return { work: text, locator: null };
  return {
    work: match[1].replace(/[\s,]+$/, ''),
    locator: match[2].replace(/\s+/g, '').replace(/:/g, '.'),
  };
}

/** Ключ источника: книга без номера стиха. */
export function workKey(value: string | null | undefined): string {
  return attributionKey(splitWorkLocator(value).work);
}

/** Значение фильтра из адреса; пусто — фильтра нет. */
export function attributionFilter(
  raw: string | undefined | null,
  keyOf: (value: string) => string = attributionKey,
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_ATTRIBUTION_FILTER_LENGTH) return null;
  return keyOf(trimmed) || null;
}

/**
 * Какие из записанных в базе вариантов подходят под фильтр. Пустой список —
 * не подходит ничего, и лента честно пуста.
 */
export function matchingVariants(
  variants: readonly (string | null)[],
  key: string,
  keyOf: (value: string) => string = attributionKey,
): string[] {
  return variants.filter(
    (variant): variant is string => variant !== null && keyOf(variant) === key,
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
  /** Что показывать: для источников — книга без номера стиха. */
  labelOf: (value: string) => string = (value) => value,
): AttributionOption[] {
  const groups = new Map<
    string,
    { total: number; best: string; bestCount: number }
  >();
  for (const row of rows) {
    const raw = row.value?.replace(/\s+/g, ' ').trim();
    const label = raw ? labelOf(raw) : raw;
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
