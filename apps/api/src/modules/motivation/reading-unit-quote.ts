/**
 * Что из стиха предлагать автору рилса.
 *
 * Поисковая единица книги склеивает все части стиха в одну строку: санскрит
 * деванагари, латинскую транслитерацию, пословный перевод («ахам — я; йе —
 * которые…») и только потом перевод. Для поиска это правильно, а в поле цитаты
 * из такой строки приезжала транскрипция — читать её человеку невозможно.
 *
 * Поэтому берём перевод из payload главы, где части лежат раздельно. Порядок
 * запасных вариантов важен: у стихотворных книг перевод в `translationHtml`,
 * у прозаических (лекции, письма) стиха нет вовсе и текст лежит в `bodyHtml`.
 * Комментарий (`purportHtml`) не берём никогда — это слова комментатора о
 * стихе, а не сам стих, и как цитата он подписан был бы неверно.
 */

export type ReadingUnitLike = {
  id?: string;
  title?: string;
  translationHtml?: string;
  bodyHtml?: string;
  /**
   * Остальные части стиха перечислены, чтобы было видно: их мы намеренно не
   * берём. Санскрит, транслитерация и пословный разбор нечитаемы в ленте, а
   * комментарий принадлежит комментатору, не автору стиха.
   */
  originalHtml?: string;
  transliterationHtml?: string;
  synonymsHtml?: string;
  purportHtml?: string;
};

/** Текст без разметки: payload хранит HTML для читалки. */
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Перевод стиха; для прозы — её текст. Пусто — предлагать нечего. */
export function readingUnitQuote(unit: ReadingUnitLike): string {
  const source = unit.translationHtml?.trim() || unit.bodyHtml?.trim() || '';
  return source ? stripHtml(source) : '';
}

/**
 * Единицы главы из payload. Форма payload проверяется на месте: он лежит в
 * базе как JSON, и его структура типами не гарантируется.
 */
export function readingUnitsOf(payload: unknown): ReadingUnitLike[] {
  if (!payload || typeof payload !== 'object') return [];
  const units = (payload as { units?: unknown }).units;
  if (!Array.isArray(units)) return [];
  return units.filter(
    (unit): unit is ReadingUnitLike => Boolean(unit) && typeof unit === 'object',
  );
}
