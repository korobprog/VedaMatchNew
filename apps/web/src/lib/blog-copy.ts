import type { BlogPostDto } from "@vedamatch/shared";

/**
 * Текст поста для копирования (VED-238: «возможностью их репоста и
 * копирования содержания»).
 *
 * Копируется содержание, а не ссылка: человек уносит пост в мессенджер или
 * в заметки, и там нужны слова, а не адрес, за которым надо входить в
 * портал. Ссылка добавляется последней строкой — чтобы можно было вернуться
 * к оригиналу, но чтобы она не мешала прочитать сам текст.
 *
 * Чистый модуль: сборка строки проверяется тестом, кнопка вокруг неё — нет.
 */

export interface BlogCopyOptions {
  /** Адрес портала; без него ссылку не добавляем. */
  origin?: string | null;
}

/**
 * Репост показывает чужой пост под своим комментарием — копируем оба, но
 * первым идёт оригинал: именно он и есть содержание.
 */
export function buildBlogPostCopy(
  post: BlogPostDto,
  options: BlogCopyOptions = {},
): string {
  const parts: string[] = [];
  const source = post.repostOf;

  if (source) {
    parts.push(block(source.author.name, source.title, source.text));
    const comment = block(post.author.name, post.title, post.text, "репост");
    if (comment) parts.push(comment);
  } else {
    parts.push(block(post.author.name, post.title, post.text));
  }

  const link = postLink(post, options.origin);
  if (link) parts.push(link);

  return parts.filter((part) => part !== "").join("\n\n");
}

/** Абсолютный адрес поста; `null`, когда адрес портала неизвестен. */
export function postLink(
  post: Pick<BlogPostDto, "id">,
  origin: string | null | undefined,
): string | null {
  const trimmed = origin?.trim();
  if (!trimmed) return null;
  return `${trimmed.replace(/\/$/, "")}/blog?post=${encodeURIComponent(post.id)}`;
}

function block(
  author: string,
  title: string | null,
  text: string,
  prefix?: string,
): string {
  const head = prefix ? `${prefix}: ${author}` : author;
  const lines = [head];
  if (title) lines.push(title);
  if (text.trim()) lines.push(text.trim());
  // Один автор без единого слова — это картиночный пост; копировать нечего,
  // и пустая строка «Имя» в буфере обмена только мешает.
  if (lines.length === 1) return "";
  return lines.join("\n");
}
