// Типы сервиса «Вакансии». Решение и границы — в задаче VED-24: одна
// сущность «Предложение» трёх видов, отклик своим профилем без резюме,
// переписка через Чат по событию.
//
// В отличие от Объявлений деньги здесь уместны: работа за оплату — основной
// вид. Но резюме и поиска по людям нет и не будет: соискатель приходит сам,
// работодатель видит только тех, кто откликнулся.
import type { CommunityBadgeDto } from './community';
import type { ProfileLocation } from './index';

/**
 * Вид предложения. Меняет обязательные поля и срок жизни, поэтому набор
 * закрыт: работа за деньги, служение (сева) и разовая задача.
 */
export type VacancyKind = 'work' | 'seva' | 'task';

export type VacancyStatus =
  | 'draft'
  | 'published'
  | 'hidden_by_author'
  | 'closed'
  | 'expired'
  | 'hidden_by_reports'
  | 'removed_by_admin';

export type VacancyAudience = 'everyone' | 'my_city' | 'my_community';

/** `city` — метка в центроиде города; адрес человека наружу не уезжает. */
export type VacancyPlacePrecision = 'exact' | 'city';

/** Формат работы. `remote` снимает требование города. */
export type VacancyWorkFormat = 'onsite' | 'remote' | 'hybrid';

export type VacancyEmployment = 'full_time' | 'part_time' | 'project' | 'shift';

/** За что указана оплата. */
export type VacancyPayPeriod = 'month' | 'day' | 'hour' | 'task';

/** Срок служения: постоянно, до даты, на время события. */
export type VacancySevaTerm = 'ongoing' | 'until' | 'event';

/** Что предоставляют на служении. */
export type VacancyPerk = 'prasad' | 'housing' | 'travel' | 'stipend';

export type VacancyResponseStatus =
  | 'new'
  | 'in_dialog'
  | 'accepted'
  | 'declined'
  | 'withdrawn';

export type VacancyReportReason =
  | 'spam'
  | 'scam'
  | 'misleading'
  | 'not_community'
  | 'inappropriate_content'
  | 'duplicate'
  | 'other';

export type VacancyReportStatus = 'open' | 'reviewed' | 'dismissed';

export const VACANCY_TITLE_MAX_LENGTH = 140;
export const VACANCY_DESCRIPTION_MAX_LENGTH = 8000;
export const VACANCY_SCHEDULE_MAX_LENGTH = 200;
export const VACANCY_RESPONSE_MESSAGE_MAX_LENGTH = 1000;
export const VACANCY_REPORT_NOTE_MAX_LENGTH = 1000;
export const VACANCY_MODERATOR_NOTE_MAX_LENGTH = 1000;

/** Сколько предложений человек может опубликовать за сутки. */
export const VACANCIES_PER_DAY = 5;
/** Сколько откликов человек может отправить за сутки. */
export const VACANCY_RESPONSES_PER_DAY = 20;
/** За сколько дней до конца показываем кнопку «продлить». */
export const VACANCY_RENEW_WINDOW_DAYS = 7;

/** Кто разместил. Имя — всегда resolveDisplayName. */
export interface VacancyAuthorDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/** Оплата. Пустые границы при `negotiable` — «по договорённости». */
export interface VacancyPayDto {
  min: number | null;
  max: number | null;
  currency: string;
  period: VacancyPayPeriod;
  negotiable: boolean;
}

export interface VacancyOfferDto {
  id: string;
  kind: VacancyKind;
  title: string;
  description: string | null;
  audience: VacancyAudience;

  city: string | null;
  country: string | null;
  /** Координаты только у общественного места (`exact`), иначе null. */
  lat: number | null;
  lon: number | null;
  placePrecision: VacancyPlacePrecision;
  /** Место не важно: удалённая работа или задача из любого города. */
  isRemote: boolean;

  // Работа
  workFormat: VacancyWorkFormat | null;
  employment: VacancyEmployment | null;
  schedule: string | null;
  pay: VacancyPayDto | null;

  // Служение
  sevaTerm: VacancySevaTerm | null;
  sevaUntil: string | null;
  perks: VacancyPerk[];

  // Разовая задача
  dueAt: string | null;

  status: VacancyStatus;
  /** Причина скрытия от модератора; видна автору. */
  moderatorNote: string | null;

  author: VacancyAuthorDto;
  /** Опубликовано от имени общины. null — от себя лично. */
  postedAs: CommunityBadgeDto | null;

  publishedAt: string;
  expiresAt: string;
  closedAt: string | null;
  /** Можно ли продлить прямо сейчас: срок близко или уже вышел. */
  canRenew: boolean;

  viewsCount: number;
  responsesCount: number;

  /** Смотрящий — автор. Управляющие кнопки рисуются по нему. */
  isMine: boolean;
  /** Статус отклика смотрящего, если он откликался. */
  myResponse: {
    id: string;
    status: VacancyResponseStatus;
  } | null;
}

export interface VacancyFeedFilters {
  q?: string;
  kind?: VacancyKind;
  city?: string;
  /** Только удалённые или «из любого города». */
  remote?: boolean;
  /** Только от общин. */
  communityOnly?: boolean;
  communityId?: string;
  /** Только мои предложения, во всех статусах. */
  mine?: boolean;
  cursor?: string;
  limit?: number;
}

export interface VacancyFeedResponse {
  items: VacancyOfferDto[];
  /** Курсор следующей страницы; null — дальше ничего нет. */
  nextCursor: string | null;
}

export interface VacancyPayInput {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  period?: VacancyPayPeriod | null;
  negotiable?: boolean;
}

export interface CreateVacancyOfferRequest {
  kind: VacancyKind;
  title: string;
  description?: string | null;
  audience?: VacancyAudience;
  location?: ProfileLocation | null;
  isRemote?: boolean;
  /** Публикация от имени общины; право проверяется на сервере. */
  communityId?: string | null;

  workFormat?: VacancyWorkFormat | null;
  employment?: VacancyEmployment | null;
  schedule?: string | null;
  pay?: VacancyPayInput | null;

  sevaTerm?: VacancySevaTerm | null;
  sevaUntil?: string | null;
  perks?: VacancyPerk[];

  dueAt?: string | null;
}

export type UpdateVacancyOfferRequest = Partial<CreateVacancyOfferRequest>;

/** Смена статуса — действие, а не правка полей, поэтому отдельный запрос. */
export interface UpdateVacancyStatusRequest {
  status: Extract<
    VacancyStatus,
    'published' | 'hidden_by_author' | 'closed' | 'draft'
  >;
}

// ===== Отклики =====

export interface VacancyResponseUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
}

export interface VacancyResponseDto {
  id: string;
  offerId: string;
  /** Заголовок и вид предложения — чтобы список откликов был читаем. */
  offerTitle: string;
  offerKind: VacancyKind;
  status: VacancyResponseStatus;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  user: VacancyResponseUser;
}

export interface CreateVacancyResponseRequest {
  message?: string | null;
}

/** Решение автора по отклику. `in_dialog` ставится при открытии диалога. */
export interface UpdateVacancyResponseStatusRequest {
  status: Extract<VacancyResponseStatus, 'in_dialog' | 'accepted' | 'declined'>;
}

/** Отклики на одно предложение — видит только его автор. */
export interface VacancyResponsesResponse {
  items: VacancyResponseDto[];
}

/** «Куда я откликнулся» плюс остаток суточного лимита. */
export interface MyVacancyResponsesResponse {
  items: VacancyResponseDto[];
  remainingToday: number;
}

// ===== Жалобы =====

export interface CreateVacancyReportRequest {
  reason: VacancyReportReason;
  note?: string | null;
}

export interface AdminVacancyReportDto {
  id: string;
  offerId: string;
  offerTitle: string;
  offerKind: VacancyKind;
  offerStatus: VacancyStatus;
  reason: VacancyReportReason;
  note: string | null;
  status: VacancyReportStatus;
  /** Мирское имя: в админке нужно понимать, кто перед тобой. */
  reporterName: string;
  authorName: string;
  createdAt: string;
}

export interface AdminVacancyReportsResponse {
  items: AdminVacancyReportDto[];
  openCount: number;
}

export interface AdminVacancyReportDecisionRequest {
  /** `hide` скрывает предложение, `dismiss` отклоняет жалобу. */
  decision: 'hide' | 'dismiss' | 'remove';
  moderatorNote?: string | null;
}

// ===== События шины =====

/**
 * События «Вакансий». Payload самодостаточен: подписчик (Чат, Уведомления,
 * агенда Работы) не имеет права дочитывать недостающее из наших таблиц.
 * Формулировки собирает подписчик, издатель сообщает факт.
 */
export type VacancyEvent =
  | {
      name: 'vacancies.response.created';
      offerId: string;
      offerTitle: string;
      offerKind: VacancyKind;
      responseId: string;
      /** Автор предложения — получатель. */
      authorId: string;
      responderId: string;
      responderName: string;
      message: string | null;
    }
  | {
      name: 'vacancies.response.status-changed';
      offerId: string;
      offerTitle: string;
      offerKind: VacancyKind;
      responseId: string;
      authorId: string;
      /** Соискатель — получатель. */
      responderId: string;
      status: Extract<VacancyResponseStatus, 'in_dialog' | 'accepted' | 'declined'>;
    }
  | {
      name: 'vacancies.offer.closed';
      offerId: string;
      offerTitle: string;
      offerKind: VacancyKind;
      authorId: string;
      /** Соискатели с живыми откликами — получатели. */
      responderIds: string[];
    };

export type VacancyEventName = VacancyEvent['name'];
