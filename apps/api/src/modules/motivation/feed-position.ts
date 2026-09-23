/**
 * «С того места, где остановился» (VED-432).
 *
 * Лента раздела («Мудрость мира»), источника («Бхагавад-гита») и открыток
 * раздела — это книга, которую читают подряд, а не поток «что нового».
 * Новичок открывает её с первой страницы, вернувшийся — с той картинки, на
 * которой ушёл. Личная лента («свежее → непросмотренное → повтор»), избранное
 * и «Вперемешку» позиции не помнят: у них нет постоянного порядка, и «то же
 * место» завтра было бы другим постом.
 *
 * Чистый модуль: какую ленту считать одной и где в ней начать — проверяется
 * тестом, а сервис только читает и пишет строку позиции.
 */

/** Столбец `feedKey` — `VarChar(400)`. */
export const FEED_POSITION_KEY_MAX = 400;

export interface FeedPositionQuery {
  /** Вкладка: `art` — «Лента», `cards` — «Открытки», без значения — обе. */
  style?: 'art' | 'cards';
  /** Папки ленты, уже разобранные `feedCategories`. */
  categories: readonly string[];
  /** Нормализованный ключ автора (`attributionFilter`), `null` — нет фильтра. */
  speakerKey: string | null;
  /** Нормализованный ключ источника (`attributionFilter(…, sourceKey)`). */
  workKey: string | null;
}

/**
 * Ключ ленты для строки позиции. Одна и та же лента — один ключ, как бы её
 * ни открыли: папки без учёта порядка («vedy,praktika» и «praktika,vedy»),
 * автор и источник — уже нормализованными ключами, поэтому «Бхагавад-гита
 * 2.7» из подписи и «бхагавад–гита» из кнопки на главной попадают в одну
 * позицию.
 *
 * `null` — ленту не запоминаем: ни папки, ни автора, ни источника, то есть
 * это личная лента.
 */
export function feedPositionKey(query: FeedPositionQuery): string | null {
  const categories = [...new Set(query.categories)].sort();
  if (categories.length === 0 && !query.speakerKey && !query.workKey)
    return null;
  return [
    query.style ?? 'all',
    categories.join(','),
    query.speakerKey ?? '',
    query.workKey ?? '',
  ]
    .join('|')
    .slice(0, FEED_POSITION_KEY_MAX);
}

/**
 * С какого места упорядоченной ленты начать первую страницу. `null` — поста
 * в этой ленте нет (сняли с показа, переложили в другую папку, открыли не в
 * той вкладке): тогда лента идёт с начала, а не с чужого места.
 */
export function startOffset(
  orderedIds: readonly string[],
  targetId: string | null | undefined,
): number | null {
  if (!targetId) return null;
  const index = orderedIds.indexOf(targetId);
  return index < 0 ? null : index;
}
