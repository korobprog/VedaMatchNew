// Сервис «Блог-лента» (VED-238, VED-116).
//
// Лента портала в духе Instagram: пост участника — крупная картинка, короткий
// заголовок и текст. Лента живёт двумя срезами. «Текущая» — то, что показано
// на главной и на верху страницы сервиса: посты, у которых не истёк срок
// нахождения в ленте. «Вся» — архив, все прошлые посты без срока давности:
// именно её открывает нажатие на виджет главной.
//
// Срок нахождения в ленте задаёт администратор: общий по умолчанию и
// точечный у поста. Участник срок не трогает — он просто постит один за
// другим (VED-238).

/** Заголовок поста: он виден в ленте рядом с картинкой, поэтому короткий. */
export const BLOG_POST_TITLE_MAX_LENGTH = 120;
/** Текст поста. Длиннее статьи Библиотеки не нужен — это лента, а не журнал. */
export const BLOG_POST_TEXT_MAX_LENGTH = 5000;
/** Картинок в одном посте — как в карусели Instagram. */
export const BLOG_POST_MAX_IMAGES = 10;
/** Сколько постов участник может опубликовать за сутки. */
export const BLOG_MAX_POSTS_PER_DAY = 20;

/** Срок по умолчанию: трое суток. Столько живёт новость портала в ленте. */
export const BLOG_DEFAULT_FEED_LIFETIME_HOURS = 72;
export const BLOG_MIN_FEED_LIFETIME_HOURS = 1;
/** Год — верхняя граница; «совсем без срока» задаётся отдельным значением. */
export const BLOG_MAX_FEED_LIFETIME_HOURS = 24 * 365;

/** Сколько постов показывает виджет главной. Больше — и он съедает экран. */
export const BLOG_HOME_PREVIEW_SIZE = 4;
/** Размер страницы полной ленты. */
export const BLOG_FEED_PAGE_SIZE = 12;

/** Картинки: те же ограничения, что у объявлений и Рынка. */
export const BLOG_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const BLOG_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export interface BlogAuthorDto {
  id: string;
  /** Всегда через resolveDisplayName(): наружу человек виден духовным именем. */
  name: string;
  avatarUrl: string | null;
}

export interface BlogImageDto {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

/** Исходный пост под репостом: снимка не делаем, читаем оригинал. */
export interface BlogRepostSourceDto {
  id: string;
  author: BlogAuthorDto;
  title: string | null;
  text: string;
  images: BlogImageDto[];
  createdAt: string;
}

export interface BlogPostDto {
  id: string;
  author: BlogAuthorDto;
  title: string | null;
  text: string;
  images: BlogImageDto[];
  createdAt: string;
  /** ISO-время, до которого пост показан в ленте; null — бессрочно. */
  feedUntil: string | null;
  /** Посчитано сервером на момент ответа: пост ещё в текущей ленте. */
  inFeed: boolean;
  pinned: boolean;
  repostCount: number;
  repostOf: BlogRepostSourceDto | null;
  /** Может удалить: автор или администратор. */
  canManage: boolean;
  /** Может менять срок и закрепление: только администратор. */
  canModerate: boolean;
}

export interface BlogFeedResponse {
  posts: BlogPostDto[];
  /** null — дальше ничего нет. */
  nextCursor: string | null;
}

/** Виджет главной: несколько свежих постов и сколько их всего в ленте. */
export interface BlogHomeFeedResponse {
  posts: BlogPostDto[];
  /** Сколько постов сейчас в ленте всего — из них показаны первые. */
  total: number;
}

export interface BlogAuthorFeedResponse extends BlogFeedResponse {
  author: BlogAuthorDto;
  /** Сколько всего постов у автора. */
  total: number;
}

export interface BlogSettingsDto {
  /** Срок по умолчанию для новых постов, в часах. 0 — без срока. */
  feedLifetimeHours: number;
}

export interface CreateBlogPostRequest {
  title?: string | null;
  text: string;
}

export interface BlogPostLifetimeRequest {
  /** Часы от момента публикации; null — снять срок, пост в ленте навсегда. */
  hours: number | null;
}

export interface BlogPinRequest {
  pinned: boolean;
}

/** Файл, который не доехал: имя для человека и код причины. */
export interface BlogImageRejection {
  name: string;
  reason: string;
}

/**
 * Ответ на публикацию. Картинки едут тем же запросом, что и пост, поэтому
 * часть из них может не доехать при удачном посте — отказы возвращаются
 * рядом, а не вместо.
 */
export interface BlogPostCreatedResponse {
  post: BlogPostDto;
  failed: BlogImageRejection[];
}
