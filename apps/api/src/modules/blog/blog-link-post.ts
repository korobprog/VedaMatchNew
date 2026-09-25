import {
  BLOG_POST_TEXT_MAX_LENGTH,
  BLOG_POST_TITLE_MAX_LENGTH,
  type LibraryBlogShareRequestedEvent,
} from '@vedamatch/shared';
import { normalizeText, normalizeTitle } from './blog-validate';

/**
 * Пост из материала другого сервиса (VED-490): «В Блог-ленту» в Образовании.
 *
 * Формулировку собирает подписчик — здесь: издатель прислал заголовок,
 * описание и адрес, а как из них сложить пост, решает лента. Заголовок и
 * текст подрезаются под пределы ленты, а не отвергаются: описание статьи с
 * чужого сайта длины не выбирало.
 */
export interface BlogLinkPostInput {
  title: string | null;
  text: string;
  linkUrl: string;
  linkLabel: string;
  linkImageUrl: string | null;
}

/** Ссылке место только на портале или на https: `javascript:` в посте не нужен. */
export function safeLinkUrl(value: string | null | undefined): string | null {
  const url = value?.trim();
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** `null` — ссылка негодная, пост не собрать. */
export function buildBlogLinkPost(
  event: Pick<
    LibraryBlogShareRequestedEvent,
    'title' | 'text' | 'url' | 'imageUrl' | 'label'
  >,
): BlogLinkPostInput | null {
  const linkUrl = safeLinkUrl(event.url);
  if (!linkUrl) return null;
  const title = normalizeTitle(event.title);
  return {
    title: title ? clip(title, BLOG_POST_TITLE_MAX_LENGTH) : null,
    text: clip(normalizeText(event.text), BLOG_POST_TEXT_MAX_LENGTH),
    linkUrl,
    linkLabel: event.label.trim(),
    linkImageUrl: safeLinkUrl(event.imageUrl),
  };
}
