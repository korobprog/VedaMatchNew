// Типы сервиса «Объявления». См. docs/notices-service-plan.md.
//
// Денежных полей здесь нет и быть не должно: как только в объявлении
// появляется цена, это Рынок.
import type { CommunityBadgeDto } from './community';
import type {
  ProfileLocation,
  ProfileMessengers,
  ProfileSocialLinks,
} from './index';

/**
 * Вид объявления. Меняет форму, обязательные поля и срок жизни, поэтому
 * набор закрыт. Тематика живёт отдельно, рубрикой.
 */
export type NoticeKind = 'offer' | 'request' | 'event' | 'info';

export type NoticeStatus =
  | 'draft'
  | 'published'
  | 'hidden_by_author'
  | 'resolved'
  | 'expired'
  | 'moved_to_market'
  | 'hidden_by_reports'
  | 'removed_by_admin';

/** `city` — метка в центроиде города; дом человека на карте не показывается. */
export type NoticePlacePrecision = 'exact' | 'city';

export type NoticeAudience = 'everyone' | 'my_city' | 'my_community';

/**
 * Повторяемость события. Вхождения не хранятся строками: правка «воскресной
 * программы» превратилась бы в правку сотни записей.
 *
 * `ekadashi` работает только при загруженном лунном календаре — см.
 * `apps/api/src/modules/notices/ekadashi-dates.ts`.
 */
export type NoticeRecurrence =
  | 'none'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'ekadashi';

/** Одно вхождение повторяющегося события в календаре. */
export interface NoticeOccurrenceDto {
  noticeId: string;
  title: string;
  rubricSlug: string;
  startsAt: string;
  endsAt: string | null;
  timeZone: string | null;
  venueName: string | null;
  city: string | null;
  isOnline: boolean;
  /** Значок общины, от имени которой опубликовано. */
  communityName: string | null;
}

export interface NoticeCalendarResponse {
  items: NoticeOccurrenceDto[];
  /**
   * Повтор `ekadashi` доступен только с загруженным лунным календарём.
   * Клиент прячет вариант в форме, когда здесь `false`.
   */
  ekadashiAvailable: boolean;
}

export const NOTICE_TITLE_MAX_LENGTH = 140;
export const NOTICE_DESCRIPTION_MAX_LENGTH = 8000;
export const NOTICE_VENUE_MAX_LENGTH = 160;
export const MAX_IMAGES_PER_NOTICE = 6;

/** Сколько объявлений человек может опубликовать за сутки. */
export const NOTICES_PER_DAY = 5;

/** За сколько дней до конца показываем кнопку «продлить». */
export const NOTICE_RENEW_WINDOW_DAYS = 7;

export interface NoticeRubricDto {
  id: string;
  slug: string;
  /** Виды, в которых рубрика предлагается. Пустой массив — во всех. */
  kinds: NoticeKind[];
  nameRu: string;
  nameEn: string;
  position: number;
  noticesCount: number;
}

export interface NoticeRubricsResponse {
  items: NoticeRubricDto[];
}

export interface NoticeImageDto {
  id: string;
  url: string;
  width: number;
  height: number;
  sortOrder: number;
}

/** Автор объявления. Имя — всегда resolveDisplayName. */
export interface NoticeAuthorDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Значок общины автора, если он её не скрыл. */
  community: CommunityBadgeDto | null;
}

export interface NoticeDto {
  id: string;
  kind: NoticeKind;
  rubric: NoticeRubricDto;
  titleRu: string | null;
  titleEn: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  audience: NoticeAudience;

  city: string | null;
  country: string | null;
  /**
   * Координаты. Заполнены только при `placePrecision: 'exact'` — у общин,
   * храмов и площадок событий. У объявления человека здесь null, даже если
   * город указан: метка не должна указывать на дом.
   */
  lat: number | null;
  lon: number | null;
  placePrecision: NoticePlacePrecision;

  startsAt: string | null;
  endsAt: string | null;
  timeZone: string | null;
  venueName: string | null;
  isOnline: boolean;
  onlineUrl: string | null;
  repeat: NoticeRecurrence;
  repeatUntil: string | null;

  status: NoticeStatus;
  needsReview: boolean;
  primaryImageUrl: string | null;
  images: NoticeImageDto[];

  author: NoticeAuthorDto;
  /** Опубликовано от имени общины. null — от себя лично. */
  postedAs: CommunityBadgeDto | null;

  publishedAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  /** Можно ли продлить прямо сейчас: срок близко или уже вышел. */
  canRenew: boolean;

  viewsCount: number;
  responsesCount: number;
  thanksCount: number;

  /** Смотрящий — автор объявления. Управляющие кнопки рисуются по нему. */
  isMine: boolean;
}

export interface NoticeFeedFilters {
  q?: string;
  kind?: NoticeKind;
  rubric?: string;
  city?: string;
  country?: string;
  communityId?: string;
  /**
   * Радиус в километрах вокруг точки `lat`/`lon`. Приходит парой с точкой:
   * точка без радиуса ничего не сужает, радиус без точки не от чего
   * отсчитывать.
   */
  radiusKm?: number;
  lat?: number;
  lon?: number;
  /** Только мои объявления, во всех статусах. */
  mine?: boolean;
  cursor?: string;
  limit?: number;
}

/** Метка на карте: отдельное объявление. */
export interface NoticeMapPoint {
  id: string;
  title: string;
  kind: NoticeKind;
  lat: number;
  lon: number;
  /** `city` — метка стоит в центре города, а не по адресу автора. */
  precision: NoticePlacePrecision;
}

/** Агрегат по городу: столько объявлений, сколько показывает счётчик. */
export interface NoticeMapCluster {
  city: string;
  country: string | null;
  lat: number;
  lon: number;
  count: number;
}

/**
 * Ответ карты. Режим выбирает сервер: только он знает, сколько записей попало
 * в рамку, и только так у клиента не появляется второй правды о том, сколько
 * объектов в точке.
 */
export type NoticeMapResponse =
  | {
      mode: 'points';
      points: NoticeMapPoint[];
      withoutLocation: number;
    }
  | {
      mode: 'clusters';
      clusters: NoticeMapCluster[];
      withoutLocation: number;
    };

export interface NoticeFeedResponse {
  items: NoticeDto[];
  /** Курсор следующей страницы; null — дальше ничего нет. */
  nextCursor: string | null;
}

export interface CreateNoticeRequest {
  kind: NoticeKind;
  rubricSlug: string;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  audience?: NoticeAudience;
  location?: ProfileLocation | null;
  /** Публикация от имени общины; право проверяется на сервере. */
  communityId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timeZone?: string | null;
  venueName?: string | null;
  isOnline?: boolean;
  onlineUrl?: string | null;
  repeat?: NoticeRecurrence;
  repeatUntil?: string | null;
}

export type UpdateNoticeRequest = Partial<CreateNoticeRequest>;

/** Смена статуса — действие, а не правка полей, поэтому отдельный запрос. */
export interface UpdateNoticeStatusRequest {
  status: Extract<
    NoticeStatus,
    'published' | 'hidden_by_author' | 'resolved' | 'draft'
  >;
}

export interface NoticeImagesResponse {
  images: NoticeImageDto[];
}

export interface ReorderNoticeImagesRequest {
  imageIds: string[];
}

export type NoticeUploadFailureCode =
  | 'unsupported_type'
  | 'file_too_large'
  | 'invalid_image'
  | 'too_many_images'
  | 'processing_failed'
  | 'image_upload_unavailable';

export interface NoticeImageUploadFailure {
  fileName: string;
  code: NoticeUploadFailureCode;
  message: string;
}

export interface NoticeImageUploadResponse {
  images: NoticeImageDto[];
  failed: NoticeImageUploadFailure[];
}

// ===== Отклики, благодарности, жалобы =====

export type NoticeResponseStatus =
  | 'open'
  | 'accepted'
  | 'declined'
  | 'withdrawn';

export const NOTICE_RESPONSE_MESSAGE_MAX_LENGTH = 1000;
export const NOTICE_THANKS_NOTE_MAX_LENGTH = 500;
export const NOTICE_REPORT_NOTE_MAX_LENGTH = 1000;

/** Сколько откликов человек может отправить за сутки. */
export const NOTICE_RESPONSES_PER_DAY = 20;

export interface NoticeResponseUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
}

export interface NoticeResponseDto {
  id: string;
  noticeId: string;
  /** Заголовок объявления — чтобы список «куда я откликнулся» был читаем. */
  noticeTitle: string;
  status: NoticeResponseStatus;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  user: NoticeResponseUser;
  /**
   * Способы связи автора объявления. Заполнены только после `accepted` и
   * только той стороне, которой они предназначены: доска не отдаёт контакты
   * пачкой, как и справочник «Контакты».
   */
  contacts: {
    socialLinks: ProfileSocialLinks;
    messengers: ProfileMessengers;
  } | null;
}

export interface CreateNoticeResponseRequest {
  message?: string | null;
}

export interface RespondToNoticeResponseRequest {
  accept: boolean;
}

/** Отклики на одно объявление — видит только его автор. */
export interface NoticeResponsesResponse {
  items: NoticeResponseDto[];
}

/** «Куда я откликнулся» плюс остаток суточного лимита. */
export interface MyNoticeResponsesResponse {
  items: NoticeResponseDto[];
  remainingToday: number;
}

export interface CreateNoticeThanksRequest {
  /** Кого благодарим. Должен быть автором объявления или откликнувшимся. */
  toUserId: string;
  note?: string | null;
}

/** Счётчик «спасибо» человека. Считается запросом, отдельной таблицы нет. */
export interface NoticeKarmaDto {
  userId: string;
  thanksCount: number;
}

export type NoticeReportReason =
  | 'spam'
  | 'commercial'
  | 'mlm'
  | 'duplicate'
  | 'scam'
  | 'inappropriate_content'
  | 'wrong_rubric'
  | 'other';

export type NoticeReportStatus = 'open' | 'reviewed' | 'dismissed';

export interface CreateNoticeReportRequest {
  reason: NoticeReportReason;
  note?: string | null;
}

export interface AdminNoticeReportDto {
  id: string;
  noticeId: string;
  noticeTitle: string;
  noticeStatus: NoticeStatus;
  /** Сработала ли автопроверка на коммерцию и на чём именно. */
  commerceHits: string[];
  reason: NoticeReportReason;
  note: string | null;
  status: NoticeReportStatus;
  /** Мирское имя: в админке нужно понимать, кто перед тобой. */
  reporterName: string;
  authorName: string;
  createdAt: string;
}

export interface AdminNoticeReportsResponse {
  items: AdminNoticeReportDto[];
  openCount: number;
}

export type NoticeSubscriptionKind = 'rubric' | 'city' | 'community';

export interface NoticeSubscriptionDto {
  id: string;
  kind: NoticeSubscriptionKind;
  targetKey: string;
  /** Человеческая подпись: название рубрики, общины или сам город. */
  title: string;
  city: string | null;
  createdAt: string;
}

export interface NoticeSubscriptionsResponse {
  items: NoticeSubscriptionDto[];
}

export interface CreateNoticeSubscriptionRequest {
  kind: NoticeSubscriptionKind;
  rubricSlug?: string | null;
  city?: string | null;
  communityId?: string | null;
}

export interface AdminNoticeReportDecisionRequest {
  /** `hide` снимает объявление, `dismiss` закрывает жалобу как необоснованную. */
  decision: 'hide' | 'dismiss' | 'suggest_market' | 'restore';
  moderatorNote?: string | null;
}
