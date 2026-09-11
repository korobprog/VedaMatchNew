/**
 * Готовая картинка с афоризмом, которую редакция кладёт прямо в категорию
 * (VED-87). Цитата уже напечатана на самой картинке — её нарисовали не мы,
 * — поэтому пост не проходит ни генерацию, ни проверку текста: админ сам
 * выбрал файл и раздел.
 *
 * Чистая часть — здесь: разбор полей формы, заголовок и ключ в хранилище.
 * sharp, S3 и база — в `MotivationPicturesService`.
 */

/** Текст на картинке, если его набрали: по нему ищут и его читает скринридер. */
export const PICTURE_TEXT_MAX = 600;
export const PICTURE_AUTHOR_MAX = 120;
/**
 * Длинная сторона после сжатия. Кадр не обрезается под 9:16 — надпись у края
 * пропала бы первой, — поэтому ограничиваем только размер.
 */
export const PICTURE_MAX_SIDE = 2048;
const TITLE_MAX = 80;

export interface PictureInput {
  /** Слаг категории; пусто — категория по умолчанию. */
  category: string | undefined;
  /** Цитата с картинки, набранная текстом. Необязательна. */
  text: string;
  author: string;
}

export type PictureInputProblem = 'text_too_long' | 'author_too_long';

/**
 * Поля приходят из `multipart/form-data`, то есть строками или вовсе не
 * приходят. Всё, что не строка, считаем пустым.
 */
export function normalizePictureInput(
  body: unknown,
): PictureInput | PictureInputProblem {
  const fields = (body && typeof body === 'object' ? body : {}) as Record<
    string,
    unknown
  >;
  const text = cleanText(fields.text);
  const author = cleanLine(fields.author);
  if (text.length > PICTURE_TEXT_MAX) return 'text_too_long';
  if (author.length > PICTURE_AUTHOR_MAX) return 'author_too_long';
  const category = cleanLine(fields.category);
  return { category: category || undefined, text, author };
}

export function pictureInputMessage(problem: PictureInputProblem): string {
  switch (problem) {
    case 'text_too_long':
      return `Текст длиннее ${PICTURE_TEXT_MAX} знаков — сократите его`;
    case 'author_too_long':
      return `Автор длиннее ${PICTURE_AUTHOR_MAX} знаков — сократите`;
  }
}

/**
 * Заголовок поста. Он нужен и там, где картинку не видно: в админке, в
 * поиске, в подписи для скринридера. Есть текст — первые слова цитаты;
 * нет — хотя бы раздел, иначе в списке опубликованного стояла бы пустая
 * строка.
 */
export function pictureTitle(text: string, categoryTitle: string): string {
  const line = text.split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? '';
  if (!line) return `Картинка из раздела «${categoryTitle}»`;
  if (line.length <= TITLE_MAX) return line;
  const cut = line.slice(0, TITLE_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?—-]+$/, '')}…`;
}

/** Своя папка, а не `uploads/`: там кадры рилсов, обрезанные под 9:16. */
export function pictureImageKey(postId: string, version: number): string {
  return `motivation/pictures/${postId}/v${version}.webp`;
}

/** Переводы строк сохраняем: шлока на картинке обычно в две-четыре строки. */
function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanLine(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
