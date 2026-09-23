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
/**
 * Текст поста (VED-371).
 *
 * Было 5000 — это примерно две страницы, и на них не влезает ни лекция, ни
 * разбор стиха: человек упирался в предел на середине текста. Совсем без
 * предела нельзя — пост без потолка это и мусор на десятки мегабайт, и
 * страница ленты, которую нечем ограничить. 20000 знаков — порядка восьми
 * страниц, больше поста ВКонтакте (15895) и вчетверо больше прежнего: в
 * кириллице это 40 КБ на пост, то есть страница ленты из 12 постов в самом
 * тяжёлом случае — около 120 КБ после сжатия, что сопоставимо с одной
 * фотографией в этой же карточке.
 *
 * Длинный текст в ленте не разворачивается целиком: карточка показывает
 * начало и кнопку «Далее» (`buildBlogTextPreview` на вебе).
 */
export const BLOG_POST_TEXT_MAX_LENGTH = 20000;
/** Картинок в одном посте — как в карусели Instagram. */
export const BLOG_POST_MAX_IMAGES = 10;
/** Сколько постов участник может опубликовать за сутки. */
export const BLOG_MAX_POSTS_PER_DAY = 20;

/** Срок по умолчанию: трое суток. Столько живёт новость портала в ленте. */
export const BLOG_DEFAULT_FEED_LIFETIME_HOURS = 72;
export const BLOG_MIN_FEED_LIFETIME_HOURS = 1;
/** Год — верхняя граница; «совсем без срока» задаётся отдельным значением. */
export const BLOG_MAX_FEED_LIFETIME_HOURS = 24 * 365;

/**
 * Сколько постов листает виджет главной. Виджет — карусель по одному посту
 * на экран телефона (VED-238, «как в Instagram»), поэтому высота главной от
 * этого числа не растёт; десять — чтобы листать было что, но ответ главной
 * не тяжелел.
 */
export const BLOG_HOME_PREVIEW_SIZE = 10;
/** Размер страницы полной ленты. */
export const BLOG_FEED_PAGE_SIZE = 12;

/** Картинки: те же ограничения, что у объявлений и Рынка. */
export const BLOG_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const BLOG_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Ролики в постах (VED-116). Только два контейнера: `video/quicktime` не
 * принимаем осознанно — .mov с айфона обычно HEVC и в браузере даёт чёрный
 * экран без единой ошибки. Перекодировать на сервере не беремся: это минуты
 * процессора на каждый ролик.
 */
export const BLOG_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const;
/** Ролик в посте — байтами, а не секундами: длину сервер узнаёт после приёма. */
export const BLOG_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/** Пять минут: «короткое видео» заказчика с запасом, но не фильм. */
export const BLOG_VIDEO_MAX_SECONDS = 300;
/** Роликов в одном посте. Остальные места карусели — фотографии. */
export const BLOG_POST_MAX_VIDEOS = 1;
/**
 * Сколько байт всех файлов принимает один запрос публикации или правки.
 * Файлы держатся в памяти процесса до разбора, и без общего потолка десять
 * вложений по пределу ролика — это полгигабайта на один запрос.
 */
export const BLOG_UPLOAD_MAX_TOTAL_BYTES = 80 * 1024 * 1024;

export type BlogMediaKind = 'photo' | 'video';

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

/**
 * Вложение поста — фото или ролик, в порядке карусели (VED-116).
 *
 * Отдельным полем `media`, а не новыми строками в `images`: приложение, уже
 * стоящее на телефонах, рисует каждый элемент `images` картинкой, и ролик
 * там стал бы битым изображением. Поэтому `images` — по-прежнему только
 * фотографии, а `media` — всё вместе, и его читают новые клиенты.
 */
export interface BlogMediaDto extends BlogImageDto {
  kind: BlogMediaKind;
  /** Обложка ролика; у фото null. */
  posterUrl: string | null;
  /** Длительность ролика в секундах, замеренная сервером; у фото null. */
  durationSec: number | null;
}

/** Исходный пост под репостом: снимка не делаем, читаем оригинал. */
export interface BlogRepostSourceDto {
  id: string;
  author: BlogAuthorDto;
  title: string | null;
  text: string;
  images: BlogImageDto[];
  media: BlogMediaDto[];
  createdAt: string;
}

export interface BlogPostDto {
  id: string;
  author: BlogAuthorDto;
  title: string | null;
  text: string;
  /** Только фотографии — для клиентов, которые не знают о роликах. */
  images: BlogImageDto[];
  /** Фото и ролики в порядке карусели. */
  media: BlogMediaDto[];
  createdAt: string;
  /**
   * Когда пост правили (VED-321); null — не правили ни разу. Отдельно от
   * `createdAt`: дата публикации в ленте остаётся на месте, отметка о
   * правке идёт рядом с ней сдержанной подписью.
   */
  editedAt: string | null;
  /** ISO-время, до которого пост показан в ленте; null — бессрочно. */
  feedUntil: string | null;
  /** Посчитано сервером на момент ответа: пост ещё в текущей ленте. */
  inFeed: boolean;
  pinned: boolean;
  repostCount: number;
  repostOf: BlogRepostSourceDto | null;
  /**
   * Может править: автор или администратор. У репоста всегда `false` —
   * правится оригинал его автором, а карточка репоста показывает живой
   * оригинал, а не снимок.
   */
  canEdit: boolean;
  /** Может удалить: автор или администратор. */
  canManage: boolean;
  /** Может менять срок и закрепление: только администратор. */
  canModerate: boolean;
  /** Пост в «Избранном» у того, кто смотрит (VED-238). */
  favorited: boolean;
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

/** Ответ на «в избранное» / «из избранного». */
export interface BlogFavoriteResponse {
  favorited: boolean;
}

export interface BlogSettingsDto {
  /** Срок по умолчанию для новых постов, в часах. 0 — без срока. */
  feedLifetimeHours: number;
}

export interface CreateBlogPostRequest {
  title?: string | null;
  text: string;
}

/**
 * Правка поста (VED-321). Шлём id оставленных картинок, а не удалённых:
 * список удалённых расходится с экраном, когда пост успели поправить из
 * другой вкладки, и тогда «убрал одну» стирает все. Новые файлы приезжают
 * тем же запросом, как и при публикации.
 */
export interface UpdateBlogPostRequest extends CreateBlogPostRequest {
  /**
   * Поля нет — картинки остаются как были: правка одного текста не имеет
   * права унести фотографии молча. Пустой список — «убрал все».
   */
  keepImageIds?: string[];
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

/** Ответ на правку: та же пара «пост и недоехавшие файлы», что у публикации. */
export type BlogPostUpdatedResponse = BlogPostCreatedResponse;
