// Типы сервиса «Контакты». См. docs/contacts-service-plan.md
import type { ProfileMessengers, ProfileSocialLinks, SpiritualStage } from './index';

/** Кто видит карточку. `by_link` — нет в выдаче, открывается по прямой ссылке. */
export type ContactsVisibility =
  | 'everyone'
  | 'verified_only'
  | 'same_city'
  | 'by_link'
  | 'hidden';

export type ContactsProfileStatus = 'draft' | 'pending' | 'active';

export type ContactsAshram =
  | 'brahmachari'
  | 'grihastha'
  | 'vanaprastha'
  | 'sannyasi';

export type ContactsFormat = 'online' | 'offline' | 'any';

export type ContactsTagKind = 'service' | 'profession' | 'skill' | 'interest';

/** Видимость отдельного поля карточки. Проще, чем в Union: матчей здесь нет. */
export type ContactsFieldVisibility = 'everyone' | 'hidden';

export interface ContactsFieldPrivacy {
  city?: ContactsFieldVisibility;
  photo?: ContactsFieldVisibility;
  age?: ContactsFieldVisibility;
}

export interface ContactsTagDto {
  id: string;
  slug: string;
  kind: ContactsTagKind;
  nameRu: string;
}

export interface ContactsTagsResponse {
  items: ContactsTagDto[];
}

/** Своя карточка — отдаётся владельцу целиком, без применения приватности. */
export interface ContactsProfileDto {
  headline: string | null;
  about: string | null;
  offers: string | null;
  languages: string[];
  ashram: ContactsAshram | null;
  format: ContactsFormat;
  visibility: ContactsVisibility;
  status: ContactsProfileStatus;
  pausedUntil: string | null;
  fieldPrivacy: ContactsFieldPrivacy | null;
  requestsFromVerifiedOnly: boolean;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Ответ на `GET contacts/profile`: карточки может ещё не быть. */
export interface ContactsProfileState {
  profile: ContactsProfileDto | null;
}

export interface ContactsUpdateProfileRequest {
  headline?: string | null;
  about?: string | null;
  offers?: string | null;
  languages?: string[];
  ashram?: ContactsAshram | null;
  format?: ContactsFormat;
  visibility?: ContactsVisibility;
  pausedUntil?: string | null;
  fieldPrivacy?: ContactsFieldPrivacy | null;
  requestsFromVerifiedOnly?: boolean;
  tagIds?: string[];
}

export type ContactsRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled';

/** Сколько запросов контакта человек может отправить за сутки. */
export const CONTACTS_REQUESTS_PER_DAY = 10;

export interface ContactsRequestUser {
  userId: string;
  name: string;
  headline: string | null;
  avatarUrl: string | null;
  city: string | null;
}

export interface ContactsRequestDto {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: ContactsRequestStatus;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  user: ContactsRequestUser;
  /** Контакты собеседника, если они уже открыты именно мне. Иначе null. */
  contacts: {
    socialLinks: ProfileSocialLinks;
    messengers: ProfileMessengers;
  } | null;
}

export interface ContactsRequestsState {
  incoming: ContactsRequestDto[];
  outgoing: ContactsRequestDto[];
  /** Сколько запросов сегодня ещё можно отправить. */
  remainingToday: number;
}

export interface ContactsCreateRequestBody {
  toUserId: string;
  message?: string | null;
}

/** Ответ на входящий запрос. Отказ по умолчанию никого не скрывает. */
export interface ContactsRespondBody {
  accept: boolean;
  /**
   * Отдельная галочка «больше не показывать меня этому человеку».
   * Отказ дать телефон и желание исчезнуть — разные вещи, поэтому
   * скрытие включается явно, а не следует из отказа автоматически.
   */
  hideFromRequester?: boolean;
}

/** Кому я открыл свои контакты. Отозванные остаются в журнале. */
export interface ContactsDisclosureDto {
  id: string;
  user: ContactsRequestUser;
  grantedAt: string;
  revokedAt: string | null;
}

export interface ContactsDisclosuresState {
  items: ContactsDisclosureDto[];
}

/**
 * Порог, ниже которого точное число совпадений не называется.
 * Это удобство интерфейса, а НЕ мера защиты: сами карточки в выдаче видны,
 * и посчитать их можно глазами. Настоящая защита — в том, что и выдача,
 * и все счётчики строятся по одному и тому же условию видимости.
 */
export const CONTACTS_COUNT_THRESHOLD = 5;

export interface ContactsSearchFilters {
  /** Поиск по заголовку, описанию и имени. Скрытых не находит. */
  q?: string;
  city?: string;
  country?: string;
  /** Радиус от города смотрящего. Требует заполненной локации у обоих. */
  radiusKm?: number;
  stages?: SpiritualStage[];
  ashram?: ContactsAshram[];
  tagIds?: string[];
  languages?: string[];
  format?: ContactsFormat;
  verifiedDevoteeOnly?: boolean;
  photoVerifiedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/** Счётчик для чипа фильтра. Считается по той же выдаче, что и результаты. */
export interface ContactsSearchFacet {
  tagId: string;
  count: number;
}

export interface ContactsSearchResponse {
  items: ContactsCardDto[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  /** Всего совпадений. null — их меньше CONTACTS_COUNT_THRESHOLD. */
  total: number | null;
  facets: ContactsSearchFacet[];
}

/**
 * Чужая карточка. Поле `contacts` заполняется только при действующем
 * раскрытии — то есть когда владелец согласился на запрос и не отозвал доступ.
 * В выдаче поиска оно всегда `null`, даже при открытом доступе: справочник
 * не должен отдавать способы связи пачкой.
 */
export interface ContactsCardDto {
  userId: string;
  name: string;
  headline: string | null;
  about: string | null;
  offers: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  age: number | null;
  languages: string[];
  ashram: ContactsAshram | null;
  format: ContactsFormat;
  spiritualStage: SpiritualStage | null;
  isVerifiedDevotee: boolean;
  isPhotoVerified: boolean;
  tags: ContactsTagDto[];
  contacts: {
    socialLinks: ProfileSocialLinks;
    messengers: ProfileMessengers;
  } | null;
}
