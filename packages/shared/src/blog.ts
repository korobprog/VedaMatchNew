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

import type { SpiritualStage } from './index';
import type { LINEAGE_ALL, LineageId } from './lineage';

/** Заголовок поста: он виден в ленте рядом с картинкой, поэтому короткий. */
export const BLOG_POST_TITLE_MAX_LENGTH = 120;
/** «О себе» на личной странице автора (VED-686). */
export const BLOG_ABOUT_MAX_LENGTH = 2000;
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

/**
 * Срок по умолчанию: без срока (`0`, VED-446). Раньше было трое суток, но
 * заказчик попросил, чтобы новые посты по умолчанию держались в ленте, пока
 * их не уберут; срок у отдельного поста администратор ставит по-прежнему.
 */
export const BLOG_DEFAULT_FEED_LIFETIME_HOURS = 0;
export const BLOG_MIN_FEED_LIFETIME_HOURS = 1;
/** Год — верхняя граница; «совсем без срока» задаётся отдельным значением. */
export const BLOG_MAX_FEED_LIFETIME_HOURS = 24 * 365;

/**
 * Сколько постов отдаёт `GET /blog/home` по умолчанию. На это число
 * опирается полоса ленты в приложении (`blog-home-strip.tsx`), и уже
 * установленные сборки зовут эндпоинт без параметров — менять нельзя.
 */
export const BLOG_HOME_PREVIEW_SIZE = 4;
/**
 * Сколько постов листает карусель на главной веба (VED-238, «как в
 * Instagram»): `GET /blog/home?view=carousel`. По одному посту на экран
 * телефона, поэтому высота главной от этого числа не растёт.
 */
export const BLOG_HOME_CAROUSEL_SIZE = 10;
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

/**
 * Категория поста (VED-590): автор назначает её при публикации или правке,
 * читатель фильтрует ленту кнопкой-значком. Пост без категории (`null`)
 * виден только в «Все».
 */
export type BlogPostCategory = 'knowledge' | 'news' | 'devotee_life' | 'calendar';

/** Порядок — порядок в меню выбора и фильтра, как в карточке заказчика. */
export const BLOG_POST_CATEGORIES: readonly BlogPostCategory[] = [
  'knowledge',
  'news',
  'devotee_life',
  'calendar',
];

export const BLOG_POST_CATEGORY_LABELS: Record<BlogPostCategory, string> = {
  knowledge: 'Знания',
  news: 'Новости',
  devotee_life: 'Жизнь преданных',
  calendar: 'Календарь',
};

export function isBlogPostCategory(value: unknown): value is BlogPostCategory {
  return (
    typeof value === 'string' &&
    (BLOG_POST_CATEGORIES as readonly string[]).includes(value)
  );
}

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
/**
 * Ссылка на материал другого сервиса (VED-490): пост отправлен в ленту
 * кнопкой «В Блог-ленту», например из Образования. Снимок на момент
 * отправки — лента не читает чужие таблицы.
 */
export interface BlogPostLinkDto {
  /** Путь на портале или полный адрес. */
  url: string;
  /** Откуда: «Образование». */
  label: string;
  imageUrl: string | null;
}

/**
 * Ответ «Блог-ленты» на событие отправки материала в ленту. `ok: false` —
 * пост не создан, `reason` — код ошибки для человека (суточный предел и т.п.).
 */
export type BlogLinkPostResult =
  | { ok: true; postId: string }
  | { ok: false; reason: string };

export interface BlogRepostSourceDto {
  id: string;
  author: BlogAuthorDto;
  title: string | null;
  text: string;
  images: BlogImageDto[];
  media: BlogMediaDto[];
  createdAt: string;
  link?: BlogPostLinkDto | null;
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
  /** Материал другого сервиса, отправленный в ленту (VED-490). */
  link?: BlogPostLinkDto | null;
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
  /** Тот, кто смотрит, отметил пост «Нравится» (VED-505). */
  liked: boolean;
  /** Сколько человек отметили пост «Нравится». */
  likeCount: number;
  /**
   * Духовная линия поста (VED-596); `null` — для всех линий. Назначает
   * автор при публикации (VED-590) и меняет автор или администратор, лента
   * фильтруется по `?lineage=`.
   * Необязательное — установленные сборки приложения поля не знают.
   */
  lineage?: LineageId | null;
  /** Категория поста (VED-590); `null` — без категории. */
  category?: BlogPostCategory | null;
  /**
   * Ступени самоидентификации, для которых пост (VED-590), в порядке пути;
   * `[]` — для всех. Лента показывает зрителю посты его ступеней и посты
   * для всех, как в Образовании и Медиатеке. Необязательное — установленные
   * сборки приложения поля не знают.
   */
  audienceStages?: SpiritualStage[];
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
  /** «О себе» с личной страницы (VED-686); null — не заполнено. */
  about: string | null;
}

/** Правка «О себе» (VED-686); пустая строка стирает текст. */
export interface UpdateBlogAboutRequest {
  about: string;
}

export interface BlogAboutResponse {
  about: string | null;
}

/** Ответ на «Нравится» и его снятие (VED-505): отметка и новое число. */
export interface BlogLikeResponse {
  liked: boolean;
  likeCount: number;
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
  /**
   * Категория (VED-590). Веб-форма шлёт её всегда и без неё не публикует.
   * Передано пустым — 400 `category_required`. Поля нет вовсе — пост без
   * категории (установленные сборки приложения до обновления), при правке —
   * категория прежняя. Репост поле не читает.
   */
  category?: BlogPostCategory | null;
  /**
   * Линия (VED-590): идентификатор справочника или `'all'` — «для всех».
   * Передано пустым — 400 `lineage_required`: пустота не считается выбором
   * «для всех». Поля нет вовсе — «для всех» при публикации (старые сборки
   * приложения), прежняя линия при правке.
   */
  lineage?: LineageId | typeof LINEAGE_ALL | null;
  /**
   * Ступени самоидентификации (VED-590): непустой список ступеней или
   * `'all'` — «для всех» (все четыре ступени — то же самое). В multipart —
   * повторяющееся поле, по ступени на значение. Передано пустым (`null`,
   * `[]`, пустая строка) — 400 `audience_stages_required`: пустота не
   * считается выбором «для всех». Поля нет вовсе — «для всех» при
   * публикации (старые сборки приложения), прежние ступени при правке.
   */
  audienceStages?: SpiritualStage[] | typeof LINEAGE_ALL | null;
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

/** Категория поста (VED-590): назначает автор или администратор. */
export interface BlogPostCategoryRequest {
  category: BlogPostCategory | null;
}

/**
 * Линия поста (VED-596, VED-590): идентификатор из справочника, `null` или
 * `'all'` — для всех.
 */
export interface BlogPostLineageRequest {
  lineage: LineageId | typeof LINEAGE_ALL | null;
}

/**
 * Ступени поста одной кнопкой (VED-590): автор или администратор. Непустой
 * список или `'all'` — для всех; пустой — 400 `audience_stages_required`.
 */
export interface BlogPostAudienceStagesRequest {
  audienceStages: SpiritualStage[] | typeof LINEAGE_ALL | null;
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

// ===== Файлы личной страницы (VED-686, часть 2) =====

/** Что за файл на личной странице: от этого зависит, как его показать. */
export type BlogAuthorFileKind = "audio" | "video" | "document";

/** Принимаемые форматы (расширение) и их вид. */
export const BLOG_AUTHOR_FILE_FORMATS = {
  mp3: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  oga: "audio",
  opus: "audio",
  wav: "audio",
  flac: "audio",
  mp4: "video",
  m4v: "video",
  webm: "video",
  mov: "video",
  pdf: "document",
  epub: "document",
  fb2: "document",
  djvu: "document",
  mobi: "document",
  doc: "document",
  docx: "document",
  odt: "document",
  rtf: "document",
  txt: "document",
  ppt: "document",
  pptx: "document",
  xls: "document",
  xlsx: "document",
} as const satisfies Record<string, BlogAuthorFileKind>;

export type BlogAuthorFileFormat = keyof typeof BLOG_AUTHOR_FILE_FORMATS;

/** Потолок размера по виду файла. */
export const BLOG_AUTHOR_FILE_MAX_BYTES: Record<BlogAuthorFileKind, number> = {
  audio: 200 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

/** Сколько файлов держит одна личная страница. */
export const BLOG_AUTHOR_FILES_MAX = 50;

/** Формат по имени файла; `null` — такой не принимаем. `.djv` — то же, что `.djvu`. */
export function blogAuthorFileFormatOf(
  fileName: string,
): BlogAuthorFileFormat | null {
  const ext = /\.([a-z0-9]{2,5})$/.exec(fileName.trim().toLowerCase())?.[1];
  if (!ext) return null;
  const format = ext === "djv" ? "djvu" : ext;
  return Object.prototype.hasOwnProperty.call(BLOG_AUTHOR_FILE_FORMATS, format)
    ? (format as BlogAuthorFileFormat)
    : null;
}

export interface BlogAuthorFileDto {
  id: string;
  /** Имя для списка и скачивания — очищенное, с расширением по формату. */
  name: string;
  format: BlogAuthorFileFormat;
  kind: BlogAuthorFileKind;
  sizeBytes: number;
  /** Подписанная ссылка: проигрывание аудио/видео и скачивание. */
  url: string;
  createdAt: string;
}

export interface BlogAuthorFilesResponse {
  files: BlogAuthorFileDto[];
}

export interface CreateBlogAuthorFileUploadRequest {
  fileName: string;
  sizeBytes: number;
}

export interface BlogAuthorFileUploadResponse {
  /** Ключ объекта — его возвращают на завершении. */
  key: string;
  url: string;
  /** Ровно те заголовки, что вошли в подпись: разойдутся — S3 ответит 403. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface CompleteBlogAuthorFileUploadRequest {
  key: string;
  fileName: string;
}

// ===== Фотоальбом личной страницы (VED-686, часть 3) =====

/** Сколько фотографий держит альбом одной страницы. */
export const BLOG_ALBUM_MAX_PHOTOS = 300;
/** Подпись к фото — строка-другая, не пост. */
export const BLOG_ALBUM_CAPTION_MAX_LENGTH = 300;

export interface BlogAlbumPhotoDto {
  id: string;
  /** Публичная ссылка на пережатую webp. */
  url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  createdAt: string;
}

export interface BlogAlbumResponse {
  /** Свежие сверху. */
  photos: BlogAlbumPhotoDto[];
}

/**
 * Ответ на заливку: фото едут пачкой (поле `files`, до
 * `BLOG_POST_MAX_IMAGES` за раз), часть может не пройти — отказы рядом.
 */
export interface BlogAlbumUploadResponse {
  photos: BlogAlbumPhotoDto[];
  failed: BlogImageRejection[];
}

/** Подпись к фото; пустая строка стирает. */
export interface UpdateBlogAlbumPhotoRequest {
  caption: string;
}
