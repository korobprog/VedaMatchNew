import type { BlogImageDto, BlogMediaDto, BlogPostDto, BlogRepostSourceDto } from '@vedamatch/shared';

/**
 * Плитка полосы блог-ленты в «Чатах» — чистая часть, перенос `blogHomeSlide`
 * сайта (`apps/web/src/components/blog/blog-media-list.ts`), чтобы главная
 * сайта и приложения показывали один пост одинаково.
 *
 * Раньше обложка бралась только из `images[0]`, а там лежат одни фотографии
 * (ролики — в `media`, см. `BlogMediaDto` в shared). Пост с одним роликом и
 * пост с материалом из Образования (VED-490) приходили без `images` и
 * рисовались «словами в рамке», хотя картинка у них есть: у ролика —
 * обложка, у материала — `link.imageUrl`.
 *
 * Правила — те же, что у сайта:
 *  - у репоста показывается оригинал;
 *  - обложка — первое вложение (фото или обложка ролика), без вложений —
 *    обложка материала другого сервиса;
 *  - картинки нет — слова в рамке, а подпись под ней только если у поста
 *    есть и заголовок, и текст (иначе одно и то же стояло бы дважды);
 *  - пост из одного текста со внешней ссылкой (без медиа и без `link`) —
 *    по-прежнему словами: у сайта так же.
 */

export interface BlogHomeTile {
  id: string;
  /** Подпись под картинкой; `null` — подписи нет. */
  title: string | null;
  /** Фото или обложка ролика; `null` — пост из одних слов. */
  coverUrl: string | null;
  /** Что написать в рамке, когда картинки нет. */
  frameText: string;
  /** На плитке — отметка «ролик» поверх обложки, как на сайте. */
  isVideo: boolean;
  mediaCount: number;
}

/** Те же длины, что у сайта: подпись — 80 знаков, слова в рамке — 140. */
const EXCERPT_LENGTH = 140;
const CAPTION_LENGTH = 80;

function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

/**
 * Вложения в порядке карусели. `media` приходит от сервера с роликами; если
 * его нет (ответ старого API во время выкладки), собираем из фотографий.
 */
export function blogPostMedia(post: Pick<BlogPostDto, 'images'> & { media?: BlogMediaDto[] | null }): BlogMediaDto[] {
  if (Array.isArray(post.media)) return post.media;
  return post.images.map((image: BlogImageDto) => ({ ...image, kind: 'photo' as const, posterUrl: null, durationSec: null }));
}

/** Что показать картинкой вместо самого вложения: у ролика — обложку. */
export function blogMediaPreviewUrl(item: BlogMediaDto): string | null {
  return item.kind === 'video' ? item.posterUrl : item.url;
}

export function blogHomeTile(post: BlogPostDto): BlogHomeTile {
  const shown: BlogPostDto | BlogRepostSourceDto = post.repostOf ?? post;
  const media = blogPostMedia(shown);
  const first = media[0] ?? null;
  const text = shown.text.replace(/\s+/g, ' ').trim();
  const coverUrl = first ? blogMediaPreviewUrl(first) : (shown.link?.imageUrl ?? null);

  let title: string | null;
  let frameText = '';
  if (coverUrl) {
    title = shown.title ?? (text ? clip(text, CAPTION_LENGTH) : null);
  } else {
    frameText = text ? clip(text, EXCERPT_LENGTH) : (shown.title ?? '');
    title = text && shown.title ? shown.title : null;
  }

  return { id: post.id, title, coverUrl, frameText, isVideo: first?.kind === 'video', mediaCount: media.length };
}

/**
 * Имя плитки для скринридера. Без подписи и без слов (пост из одной
 * фотографии) плитка иначе читалась бы пустой ссылкой — как `sr-only` у
 * сайта: «Пост с роликом» / «Пост с фотографией».
 */
export function blogHomeTileLabel(tile: BlogHomeTile, authorName: string): string {
  const name =
    tile.title ??
    (tile.coverUrl ? (tile.isVideo ? 'Пост с роликом' : 'Пост с фотографией') : tile.frameText || 'Пост');
  const video = tile.isVideo && tile.title ? ', ролик' : '';
  return `${name}${video}. ${authorName}. Открыть пост`;
}
