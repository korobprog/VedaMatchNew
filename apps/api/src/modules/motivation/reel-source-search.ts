import type { MotivationReelSourceHit } from '@vedamatch/shared';

/**
 * Чистая часть поиска фрагмента для рилса: что показать человеку и что
 * отбросить. Запрос к книгам делает сервис, здесь только отбор и нарезка.
 */

/** Цитата длиннее не ляжет на кадр — предлагать её бессмысленно. */
export const MAX_HIT_LENGTH = 600;
/** Слишком короткий кусок — обычно заголовок или обрывок, а не мысль. */
export const MIN_HIT_LENGTH = 40;

export interface SearchUnit {
  bookSlug: string;
  bookTitle: string;
  bookAuthor: string | null;
  chapterSlug: string;
  locator: unknown;
  text: string;
}

/**
 * Кандидаты в цитату: только то, что можно и показать, и потом проверить.
 * Книга без автора отбрасывается — атрибуцию по ней не собрать, а без неё
 * рилс не получит проверенного источника.
 */
export function toSourceHits(
  units: readonly SearchUnit[],
  limit = 12,
): MotivationReelSourceHit[] {
  const seen = new Set<string>();
  const hits: MotivationReelSourceHit[] = [];
  for (const unit of units) {
    if (!unit.bookAuthor) continue;
    const text = normalizeText(unit.text);
    if (text.length < MIN_HIT_LENGTH) continue;
    // Длинные единицы режем по предложениям: целая глава в поле не нужна.
    const excerpt = text.length > MAX_HIT_LENGTH ? firstSentences(text) : text;
    if (excerpt.length < MIN_HIT_LENGTH || excerpt.length > MAX_HIT_LENGTH)
      continue;
    const key = `${unit.bookSlug}:${unit.chapterSlug}:${excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      text: excerpt,
      bookSlug: unit.bookSlug,
      bookTitle: unit.bookTitle,
      chapterSlug: unit.chapterSlug,
      locator: formatLocator(unit.locator),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Первые предложения, укладывающиеся в лимит. Обрезать по символам нельзя:
 * цитата должна остаться дословной, иначе проверка по главе её не найдёт.
 */
export function firstSentences(text: string, limit = MAX_HIT_LENGTH): string {
  const parts = text.match(/[^.!?]+[.!?]+/g);
  if (!parts) return '';
  // Склеиваем ровно одним пробелом: части приходят с ведущим пробелом, и
  // наивная конкатенация давала двойные — а тогда фрагмент перестаёт быть
  // дословным, и сверка с текстом главы его не находит.
  const taken: string[] = [];
  for (const part of parts) {
    const candidate = [...taken, part.trim()].join(' ');
    if (candidate.length > limit) break;
    taken.push(part.trim());
  }
  return taken.join(' ');
}

/**
 * Порядок фрагментов внутри главы: по числам локатора — сначала глава, потом
 * стих. В базе они лежат JSON-ом произвольной формы, поэтому сортируем здесь,
 * а не запросом: иначе глава выходила вразнобой.
 */
export function sortByLocator<T extends { locator: unknown }>(
  units: readonly T[],
): T[] {
  return [...units].sort(
    (a, b) => locatorWeight(a.locator) - locatorWeight(b.locator),
  );
}

/** Числовой вес локатора: «2.47» → 2 * 1000 + 47. */
function locatorWeight(locator: unknown): number {
  const numbers = formatLocator(locator)
    .split('.')
    // Пустые части отбрасываем до Number: иначе '' превратится в 0, и
    // фрагмент без локатора уехал бы в начало главы вместо конца.
    .map((part) => part.replace(/\D/g, ''))
    .filter((part) => part.length > 0)
    .map(Number);
  if (numbers.length === 0) return Number.MAX_SAFE_INTEGER;
  return numbers.reduce((weight, part) => weight * 1000 + part, 0);
}

/**
 * Порядок частей локатора. Полагаться на порядок ключей в JSON нельзя: из
 * базы объект приходит как угодно, и «глава 2, стих 47» превращался в «47.2».
 */
const LOCATOR_ORDER = ['canto', 'part', 'chapter', 'verse', 'text', 'section'];

/** Локатор приходит из JSON-колонки: приводим к «2.47» или пустой строке. */
export function formatLocator(locator: unknown): string {
  if (typeof locator === 'string' || typeof locator === 'number')
    return String(locator);
  if (locator && typeof locator === 'object') {
    const source = locator as Record<string, unknown>;
    const keys = Object.keys(source).sort((a, b) => {
      const left = LOCATOR_ORDER.indexOf(a),
        right = LOCATOR_ORDER.indexOf(b);
      // Незнакомые ключи уходят в конец в исходном порядке.
      if (left === -1 && right === -1) return 0;
      if (left === -1) return 1;
      if (right === -1) return -1;
      return left - right;
    });
    return keys
      .map((key) => source[key])
      .filter(
        (part): part is string | number =>
          typeof part === 'string' || typeof part === 'number',
      )
      .join('.');
  }
  return '';
}
