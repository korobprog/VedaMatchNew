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

/**
 * Порядок выдачи справочника. `active` — недавно заходившие сверху,
 * `alpha` — по имени, `new` — новые карточки, `city` — по городу.
 */
export type ContactsSearchSort = 'active' | 'alpha' | 'new' | 'city';

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
  /** Согласие показываться на общей карте «Общения» — по городу, не по адресу. */
  showOnMap: boolean;
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
  showOnMap?: boolean;
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
 * Ответ на открытие переписки по запросу контакта.
 *
 * `chatId` — id диалога в чате Union: своей переписки у «Контактов» нет,
 * а заводить вторую систему чатов ради одной кнопки не нужно.
 */
export interface ContactsOpenChatResponse {
  chatId: string;
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
  /**
   * Радиус в километрах. Центр — точка `lat`/`lon`, если она задана, иначе
   * город смотрящего из портального профиля. Требует заполненной локации
   * у человека в выдаче: без координат в выдачу он не попадёт.
   */
  radiusKm?: number;
  /**
   * Центр радиуса, выбранный на карте. Без `radiusKm` не действует: точка
   * без радиуса ничего не сужает. Приходит парой — одна координата без
   * второй игнорируется.
   */
  lat?: number;
  lon?: number;
  stages?: SpiritualStage[];
  ashram?: ContactsAshram[];
  tagIds?: string[];
  languages?: string[];
  format?: ContactsFormat;
  verifiedDevoteeOnly?: boolean;
  photoVerifiedOnly?: boolean;
  page?: number;
  pageSize?: number;
  /** Порядок выдачи; пусто — недавно заходившие сверху. */
  sort?: ContactsSearchSort;
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
 * Город на карте справочника, а не человек.
 *
 * В профиле хранится город, и его координаты — центр города из геокодера:
 * у всех хабаровчан они совпадают до знака. Поэтому точка на карте
 * принципиально городская, со счётчиком людей, и сверх названия города,
 * которое и так есть в карточке, ничего не сообщает.
 */
export interface ContactsMapPoint {
  city: string;
  country: string | null;
  lat: number;
  lon: number;
  count: number;
}

export interface ContactsMapResponse {
  points: ContactsMapPoint[];
  /**
   * Сколько подходящих людей на карту не попало: город скрыт настройкой
   * приватности либо локация не заполнена. Нужно, чтобы карта могла честно
   * сказать «ещё N человек без города», а не молча их потерять.
   */
  withoutLocation: number;
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

// ===== Админка Contacts =====

/** Тег справочника глазами администрации. */
export interface ContactsAdminTagDto {
  id: string;
  slug: string;
  kind: ContactsTagKind;
  nameRu: string;
  /** Системные приезжают сидом: их можно править, но не удалять — вернутся. */
  isSystem: boolean;
  sortOrder: number;
  /** На скольких карточках стоит тег. */
  profilesCount: number;
}

export interface CreateContactsTagRequest {
  slug: string;
  nameRu: string;
  kind: ContactsTagKind;
  sortOrder?: number;
}

export type UpdateContactsTagRequest = Partial<
  Pick<CreateContactsTagRequest, 'nameRu' | 'kind' | 'sortOrder'>
>;

/** Карточка справочника глазами администрации. */
export interface ContactsAdminProfileDto {
  userId: string;
  /** Мирское имя: админский экран. */
  name: string;
  email: string;
  headline: string | null;
  about: string | null;
  offers: string | null;
  status: ContactsProfileStatus;
  visibility: ContactsVisibility;
  ashram: ContactsAshram | null;
  city: string | null;
  tags: string[];
  /** Открытых жалоб на человека — общий портальный счётчик. */
  openReports: number;
  requestsReceived: number;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface ContactsAdminProfileListResponse {
  items: ContactsAdminProfileDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ContactsAdminProfileQuery {
  /** Поиск по имени, почте и заголовку карточки. */
  q?: string;
  status?: ContactsProfileStatus;
  /** Только скрытые самим человеком. */
  hiddenOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ContactsAdminHideRequest {
  /** Причина обязательна: карточка уходит из справочника. */
  reason: string;
}

export interface ContactsAdminStats {
  profiles: { total: number; active: number; pending: number; hidden: number };
  tags: { total: number; system: number; custom: number };
  requests: { pending: number; accepted: number };
}

export const CONTACTS_HIDE_REASON_MIN_LENGTH = 5;
