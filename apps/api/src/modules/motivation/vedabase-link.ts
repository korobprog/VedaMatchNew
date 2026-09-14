/**
 * Ссылка «Комментарий» по подписи источника (VED-142).
 *
 * Ссылка на главу в Библиотеке строилась только из привязки цитаты, а её
 * ставит проверка текста по книге. У публикаций, созданных вручную, привязки
 * нет — хотя в подписи прямо написано «Бхагавад-гита 2.14», — и пункта
 * «Комментарий» у них не было. Для Гиты глава однозначно читается из номера
 * стиха, и адрес главы в Библиотеке — её номер.
 *
 * Только Бхагавад-гита: у остальных книг нумерация глав в Библиотеке не
 * совпадает с «песнь.глава.стих», и угаданная ссылка вела бы не туда.
 */

const GITA_BOOK_SLUG = 'bhagavad-gita';
const GITA_CHAPTERS = 18;

export function libraryLinkFromAttribution(
  work: string | null | undefined,
  locator: string | null | undefined,
): { bookSlug: string; chapterSlug: string } | null {
  const text = `${work ?? ''} ${locator ?? ''}`;
  if (!/бхагавад[-\s]?гит|bhagavad[-\s]?g[iī]t/i.test(text)) return null;
  // «2.14», «гл. 2, текст 14», «2:14» — глава идёт первым числом у стиха.
  const verse = /(\d{1,2})\s*[.:]\s*\d{1,3}/.exec(text);
  const chapter = verse
    ? Number(verse[1])
    : Number(/глав[аеы]?\s*(\d{1,2})/i.exec(text)?.[1] ?? NaN);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > GITA_CHAPTERS)
    return null;
  return { bookSlug: GITA_BOOK_SLUG, chapterSlug: String(chapter) };
}
