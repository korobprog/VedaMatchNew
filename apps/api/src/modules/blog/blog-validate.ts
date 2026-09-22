import {
  BLOG_POST_MAX_IMAGES,
  BLOG_POST_TEXT_MAX_LENGTH,
  BLOG_POST_TITLE_MAX_LENGTH,
} from '@vedamatch/shared';

/**
 * Проверка поста перед публикацией (VED-238).
 *
 * Глобального ValidationPipe в портале нет, DTO — обычные TS-интерфейсы,
 * поэтому мусор из тела запроса нужно ловить руками, иначе он доезжает до
 * Prisma и падает 500 вместо честного 400.
 */

export type BlogPostValidationError =
  'post_empty' | 'title_too_long' | 'text_too_long' | 'too_many_images';

export interface BlogPostValidationInput {
  title: string | null;
  text: string;
  imageCount: number;
  /** Репост можно оставить и без своих слов — там есть чужой пост. */
  isRepost?: boolean;
}

/**
 * Первая нарушенная проверка — в порядке полей формы, чтобы подсветка
 * ошибки не прыгала снизу вверх.
 */
export function validateBlogPost(
  input: BlogPostValidationInput,
): BlogPostValidationError | null {
  const title = normalizeTitle(input.title);
  const text = normalizeText(input.text);

  // Пустой пост — это пустая карточка в ленте. Картинка сама по себе постом
  // быть может (лента картиночная), а репост — даже без картинки.
  if (
    !input.isRepost &&
    title === null &&
    text === '' &&
    input.imageCount === 0
  ) {
    return 'post_empty';
  }
  if (title !== null && title.length > BLOG_POST_TITLE_MAX_LENGTH) {
    return 'title_too_long';
  }
  if (text.length > BLOG_POST_TEXT_MAX_LENGTH) return 'text_too_long';
  if (input.imageCount > BLOG_POST_MAX_IMAGES) return 'too_many_images';
  return null;
}

/** Заголовок: пустая строка и пробелы — это «заголовка нет», а не «пустой». */
export function normalizeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Текст поста. Пробелы по краям режем, переводы строк внутри оставляем — в
 * ленте абзацы живые, а не склеенные в простыню. Подряд идущие пустые
 * строки схлопываем до одной: иначе постом в ленту уезжает экран пустоты.
 */
export function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
