import type { BlogPostDto } from '@vedamatch/shared';

/**
 * Текст поста для «Копировать» (VED-238: «репост и копирование
 * содержания»). Копия `apps/web/src/lib/blog-copy.ts`: одна и та же кнопка
 * на сайте и в приложении обязана класть в буфер одно и то же.
 *
 * Копируется содержание, а ссылка — последней строкой: человек уносит пост в
 * мессенджер или заметки, и там нужны слова. У репоста первым идёт
 * оригинал — именно он и есть содержание.
 */
export function buildBlogPostCopy(post: BlogPostDto, origin?: string | null): string {
  const parts: string[] = [];
  const source = post.repostOf;
  if (source) {
    parts.push(block(source.author.name, source.title, source.text));
    parts.push(block(post.author.name, post.title, post.text, 'репост'));
  } else {
    parts.push(block(post.author.name, post.title, post.text));
  }
  const link = blogPostLink(post.id, origin);
  if (link) parts.push(link);
  return parts.filter((part) => part !== '').join('\n\n');
}

/** Адрес поста на сайте; `null`, когда адрес портала неизвестен. */
export function blogPostLink(id: string, origin: string | null | undefined): string | null {
  const trimmed = origin?.trim();
  if (!trimmed) return null;
  return `${trimmed.replace(/\/$/, '')}/blog?post=${encodeURIComponent(id)}`;
}

function block(author: string, title: string | null, text: string, prefix?: string): string {
  const lines = [prefix ? `${prefix}: ${author}` : author];
  if (title) lines.push(title);
  if (text.trim()) lines.push(text.trim());
  // Одно имя без единого слова — картиночный пост, копировать нечего.
  return lines.length === 1 ? '' : lines.join('\n');
}
