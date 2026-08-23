/**
 * Сокращение текста новости для главной.
 *
 * Новость висит на главной, пока человек не отметит «ознакомлен», и длинный
 * текст в этом режиме оттеснил бы сервисы вниз надолго. Поэтому на карточке —
 * начало, а целиком новость открывается в окне.
 *
 * Логика вынесена отдельно от компонента: границу слова и «влезает целиком»
 * проще проверить тестом, чем рендером.
 */

/** Сколько символов оставляем на карточке. Подобрано под три строки текста. */
export const NEWS_EXCERPT_LIMIT = 220;

/** Нужна ли кнопка «Читать полностью»: текст не влез в лимит. */
export function isNewsTruncated(
  body: string,
  limit: number = NEWS_EXCERPT_LIMIT,
): boolean {
  return body.trim().length > limit;
}

/**
 * Начало новости с многоточием. Режем по границе слова, но только если та
 * нашлась не слишком рано: у текста без пробелов (ссылка, длинное слово)
 * обрезка по последнему пробелу оставила бы почти пустую карточку.
 */
export function newsExcerpt(
  body: string,
  limit: number = NEWS_EXCERPT_LIMIT,
): string {
  const text = body.trim();
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > limit * 0.6 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(/[\s,;:.!?—-]+$/u, "")}…`;
}
