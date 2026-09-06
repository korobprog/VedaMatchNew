import type { LineageId } from './lineage';
export * from './vedabase';
export * from './gitabase';
export * from './union';
export * from './library';
export * from './video-embed';
export * from './motivation';
export * from './moderation';
export * from './contacts';
export * from './support';
export * from './team-applications';
export * from './notifications';
export * from './astro';
export * from './astro-chart';
export * from './astro-reading';
export * from './astro-admin';
export * from './astro-compatibility';
export * from './astro-subject';
export * from './astro-transit';
export * from './changelog';
export * from './market';
export * from './community';
export * from './notices';
export * from './audit';
export * from './chat';
export * from './pwa';
export * from './activity';
export * from './rewards';
export * from './music';
export * from './profile-name';
export * from './lineage';
export * from './spiritual-stage';

import type { BillingMode, SubscriptionState } from './support';

export type Role = 'user' | 'admin' | 'service-admin';

/**
 * Сервисы, у которых есть собственный раздел админки. Роль `service-admin`
 * получает права ровно на те из них, что перечислены в `adminServices`.
 * Портальные разделы (пользователи, биллинг, поддержка, сообщества,
 * changelog, настройки) в список не входят — они только для роли `admin`.
 */
export const ADMIN_SERVICE_SLUGS = [
  'union',
  'chat',
  'market',
  'motivation',
  'library',
  'notices',
  'astro',
  'vedabase',
  'music',
] as const;

export type AdminServiceSlug = (typeof ADMIN_SERVICE_SLUGS)[number];

/** Есть ли у аккаунта доступ хоть к какой-то части админки. */
export function isPortalAdmin(user: { role: Role }): boolean {
  return user.role === 'admin' || user.role === 'service-admin';
}

/**
 * Администрация портала как собеседник, а не как права в админке.
 *
 * Такой аккаунт — «друг всех»: его карточка видна каждому, он видит всех, и
 * начатый им диалог не проходит через запрос. Иначе поддержка не могла
 * написать первой, а человек не мог найти, кому пожаловаться.
 *
 * Только `admin`: `service-admin` отвечает за один сервис, и портального
 * доступа к людям ему это не даёт. Значение роли в базе и снаружи совпадает
 * (`'admin'`), поэтому функция принимает обычную строку.
 */
export function isPortalStaff(role: string | null | undefined): boolean {
  return role === 'admin';
}

/**
 * Право администрировать конкретный сервис. `admin` управляет всем порталом,
 * `service-admin` — только сервисами из своего списка. Список приходит из базы
 * (см. модель ServiceAdmin), а не из токена: разжалованный админ иначе
 * сохранял бы права до истечения access-токена.
 */
export function canAdminService(
  user: { role: Role; adminServices?: string[] },
  slug: AdminServiceSlug,
): boolean {
  if (user.role === 'admin') return true;
  if (user.role !== 'service-admin') return false;
  return (user.adminServices ?? []).includes(slug);
}

export type ServiceStatus = 'active' | 'coming_soon' | 'disabled';

export type SpiritualStage = 'seeker' | 'practitioner' | 'yogi' | 'devotee';

export type PortalUseStage = Exclude<SpiritualStage, 'devotee'>;

export type DevoteeVerificationStatus =
  | 'self_identified'
  | 'awaiting_mentor'
  | 'mentor_submitted'
  | 'awaiting_admin'
  | 'confirmed'
  | 'rejected'
  | 'needs_clarification';

export type StageChangeActor = 'system' | 'user' | 'admin';

export type UserAccountStatus = 'active' | 'blocked' | 'deleted';

/** Пол. Необязателен: у части аккаунтов он не заполнен. */
export type Gender = 'male' | 'female';

/**
 * Имя, под которым человека видят остальные. Духовное имя перекрывает обычное:
 * среди преданных обращаются по нему, а мирское имя тогда никуда не уезжает
 * из профиля и админки. Пустая строка духовным именем не считается.
 *
 * Единственное место, где принимается это решение: DTO наружу (карточки
 * знакомств, справочник контактов, чаты, комментарии) заполняют своё поле
 * `name` результатом этой функции, а не `user.name` напрямую.
 */
export function resolveDisplayName(user: {
  name: string;
  spiritualName?: string | null;
}): string {
  return user.spiritualName?.trim() || user.name;
}

/** Рассказ о себе в портальном профиле: столько же, сколько было в анкетах. */
export const ABOUT_MAX_LENGTH = 2000;

/**
 * Статус — строка рядом с именем: «в Маяпуре до марта», «читаю Бхагаватам,
 * пишите». Коротко намеренно: это не второй рассказ о себе, а подпись, и
 * длинная строка ломала бы карточку, где стоит в одну строку с именем.
 */
export const STATUS_LINE_MAX_LENGTH = 140;

/** Сколько языков можно перечислить: список, а не биография. */
export const LANGUAGES_MAX = 10;

export interface UserProfile {
  id: string;
  email: string;
  /** Обычное (мирское) имя. Владельцу профиля нужно для редактирования. */
  name: string;
  /** Духовное имя; null, если не заполнено. */
  spiritualName: string | null;
  /** Что видят другие: духовное имя, если оно есть, иначе обычное. */
  displayName: string;
  avatarUrl: string | null;
  avatarKey: string | null;
  /** `YYYY-MM-DD`; отдаётся только владельцу профиля */
  birthDate: string | null;
  age: number | null;
  gender: Gender | null;
  photoVerification: PhotoVerificationState;
  /** Рассказ о себе: один на портал, показывается и в Знакомствах, и в справочнике. */
  about: string | null;
  /**
   * Статус — короткая строка рядом с именем. Один на портал, как и рассказ:
   * человек один, и держать разные подписи по сервисам он не подписывался.
   */
  statusLine: string | null;
  /** Языки общения: тоже общие для всего портала. */
  languages: string[];
  homeLocation: ProfileLocation | null;
  socialLinks: ProfileSocialLinks;
  messengers: ProfileMessengers;
  role: Role;
  /** Слаги сервисов, которыми управляет `service-admin`; у остальных ролей пусто. */
  adminServices: string[];
  spiritualStage: SpiritualStage | null;
  devoteeVerificationStatus: DevoteeVerificationStatus | null;
  lastSelfIdentificationAt: string | null;
  /**
   * Духовная линия преданного (ISKCON, один из Гаудия-матхов, паривар).
   * Портальное поле: по нему Образование и Музыка показывают своё. У
   * не-преданных всегда `null` по смыслу, хотя колонка не запрещает значение.
   */
  lineage: LineageId | null;
  /**
   * Часовой пояс человека (IANA, «Asia/Vladivostok»). Определяется браузером
   * и обновляется при входе; по нему приходят утренние рассылки. null — ещё
   * не определён: тогда портал считает по Москве.
   */
  timeZone: string | null;
  subscription: SubscriptionState;
  accountStatus: UserAccountStatus;
  /** Задано, если пользователь сам запросил удаление аккаунта. */
  pendingDeletionAt: string | null;
  /** `pendingDeletionAt` + окно на отмену; после этой даты удаление финализируется. */
  deletionEligibleAt: string | null;
  /**
   * Когда аккаунт завели. Нужен не админке, а главной: подсказки новичку
   * показываются по одной и раскрываются по мере взросления аккаунта, см.
   * `advisorLimitFor` на вебе.
   */
  createdAt: string;
}

/** Состояние проверки фото: заявка пользователя и решение администрации. */
export interface PhotoVerificationState {
  status: 'none' | 'requested' | 'verified';
  requestedAt: string | null;
  verifiedAt: string | null;
}

export interface UserPhotoDto {
  id: string;
  url: string;
  sizeBytes: number;
  width: number;
  height: number;
  isPublic: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserGalleryState {
  photos: UserPhotoDto[];
  usedBytes: number;
  quotaBytes: number;
}

export type UserPhotoUploadFailureCode =
  | 'unsupported_type'
  | 'file_too_large'
  | 'invalid_image'
  | 'quota_exceeded'
  | 'processing_failed'
  | 'storage_error';

export interface UserPhotoUploadFailure {
  fileName: string;
  code: UserPhotoUploadFailureCode;
  message: string;
}

export interface UserPhotoUploadSuccess {
  fileName: string;
  photo: UserPhotoDto;
}

export interface UserPhotoUploadResponse {
  uploaded: UserPhotoUploadSuccess[];
  failed: UserPhotoUploadFailure[];
  usedBytes: number;
  quotaBytes: number;
}

export interface UpdateUserPhotoRequest {
  isPublic: boolean;
}

export interface ReorderUserPhotosRequest {
  photoIds: string[];
}

export interface ProfileLocation {
  city: string;
  country?: string;
  lat: number;
  lon: number;
  displayName?: string;
}

export interface ProfileSocialLinks {
  instagram?: string;
  telegram?: string;
  x?: string;
  facebook?: string;
  linkedin?: string;
  vk?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
}

export interface ProfileMessengers {
  telegram?: string;
  whatsapp?: string;
  mx?: string;
  phone?: string;
}

/** Обычное имя обязательно, поэтому пустым его стереть нельзя — только заменить. */
export const NAME_MAX_LENGTH = 80;

export interface ProfileUpdateRequest {
  name?: string;
  /** Пустая строка и null одинаково означают «убрать духовное имя». */
  spiritualName?: string | null;
  birthDate?: string | null;
  gender?: Gender | null;
  /** Пустая строка означает «убрать рассказ», как и у духовного имени. */
  about?: string | null;
  /** Пустая строка означает «убрать статус». */
  statusLine?: string | null;
  languages?: string[];
  homeLocation?: ProfileLocation | null;
  socialLinks?: ProfileSocialLinks;
  messengers?: ProfileMessengers;
  /** Духовная линия; `null` — убрать. Значение из справочника `LINEAGES`. */
  lineage?: LineageId | null;
  /** Часовой пояс IANA; проверяется через Intl. `null` — сбросить. */
  timeZone?: string | null;
}

/**
 * Правка портального профиля администрацией. Поля те же, что человек правит
 * сам: единая точка валидации — `UsersService.updateProfile`. Причина
 * необязательна, но уходит в журнал и в уведомление человеку: без неё правка
 * выглядит для него как чужое вмешательство без объяснений.
 */
export interface AdminProfileUpdateRequest extends ProfileUpdateRequest {
  reason?: string;
}

export interface GeoSearchResult extends ProfileLocation {
  type?: string;
}

export interface ServiceCard {
  id: string;
  slug: string;
  name: string;
  /** Английское название; `null` — показывать русское и в en-локали. */
  nameEn: string | null;
  description: string;
  iconUrl: string | null;
  url: string;
  status: ServiceStatus;
  category: string;
  requiresDevoteeVerification: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  /**
   * Слаги сервисов, которыми управляет `service-admin`. В подписанный токен не
   * попадает: AuthGuard подставляет актуальный список из базы на каждый запрос.
   */
  adminServices?: string[];
}

export interface SelfIdentificationAnswers {
  interest: 'beginning' | 'learning' | 'deepening' | 'devotional_service';
  regularPractice: 'none' | 'sometimes' | 'daily' | 'strict_daily';
  currentFocus: 'curiosity' | 'basic_practice' | 'deep_practice' | 'service_community';
  hasMentor: boolean;
  hasCommunity: boolean;
  hasSpiritualName: boolean;
  participatesInService: boolean;
  wantsRecommendations: boolean;
}

export interface SelfIdentificationState {
  spiritualStage: SpiritualStage | null;
  devoteeVerificationStatus: DevoteeVerificationStatus | null;
  lastSelfIdentificationAt: string | null;
  latestAnswers: SelfIdentificationAnswers | null;
  activeMentorRequest: {
    id: string;
    token: string;
    status: DevoteeVerificationStatus;
    mentorSubmittedAt: string | null;
    createdAt: string;
  } | null;
}

export interface SelfIdentificationSubmitResult extends SelfIdentificationState {
  detectedStage: SpiritualStage;
  mentorLinkPath: string | null;
}

export interface PortalUseStageRequest {
  stage: PortalUseStage;
}

export interface StageHistoryItem {
  id: string;
  oldStage: SpiritualStage | null;
  newStage: SpiritualStage;
  actor: StageChangeActor;
  reason: string | null;
  verificationStatus: DevoteeVerificationStatus | null;
  createdAt: string;
}

export interface MentorVerificationPublicRequest {
  userName: string;
  userStage: SpiritualStage;
  status: DevoteeVerificationStatus;
  submittedAt: string | null;
}

export interface MentorVerificationSubmit {
  mentorName: string;
  phone: string;
  email: string;
  cityOrCommunity: string;
  knownDuration: string;
  knowsPersonally: boolean;
  confirmsRegularPractice: boolean;
  confirmsService: boolean;
  confirmsSpiritualName: boolean;
  confirmsCommunityConnection: boolean;
  userCharacterReference: string;
  recommendsDevoteeStatus: boolean;
  truthConsent: boolean;
}

export interface AdminVerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: DevoteeVerificationStatus;
  mentorName: string | null;
  mentorPhone: string | null;
  mentorEmail: string | null;
  cityOrCommunity: string | null;
  knownDuration: string | null;
  knowsPersonally: boolean | null;
  confirmsRegularPractice: boolean | null;
  confirmsService: boolean | null;
  confirmsSpiritualName: boolean | null;
  confirmsCommunityConnection: boolean | null;
  recommendsDevoteeStatus: boolean | null;
  userCharacterReference: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  mentorSubmittedAt: string | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  spiritualStage: SpiritualStage | null;
  devoteeVerificationStatus: DevoteeVerificationStatus | null;
  lastSelfIdentificationAt: string | null;
  createdAt: string;
  updatedAt: string;
  hasMentorRequest: boolean;
  mentorRequestStatus: DevoteeVerificationStatus | null;
  accountStatus: UserAccountStatus;
  blockedUntil: string | null;
  deletedAt: string | null;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminUserProfile extends UserProfile {
  updatedAt: string;
  statusReason: string | null;
  blockedUntil: string | null;
  deletedAt: string | null;
}

export interface AdminSelfIdentificationResponse {
  id: string;
  answers: SelfIdentificationAnswers;
  detectedStage: SpiritualStage;
  verificationStatus: DevoteeVerificationStatus | null;
  createdAt: string;
}

export interface AdminMentorVerificationRequest extends AdminVerificationRequest {
  token: string;
  adminReviewedAt: string | null;
}

export interface AdminUserDetail {
  profile: AdminUserProfile;
  availableServices: ServiceCard[];
  stageHistory: StageHistoryItem[];
  latestSelfIdentificationResponse: AdminSelfIdentificationResponse | null;
  mentorRequest: AdminMentorVerificationRequest | null;
}

export interface AdminManualStageUpdateRequest {
  spiritualStage: SpiritualStage;
  devoteeVerificationStatus?: DevoteeVerificationStatus | null;
  reason: string;
  confirmSelfChange?: boolean;
  confirmStatusDowngrade?: boolean;
}

export interface AdminRoleUpdateRequest {
  role: Role;
  confirmSelfChange?: boolean;
}

/** Полная замена набора сервисов у роли `service-admin`. */
export interface AdminServiceScopeUpdateRequest {
  services: AdminServiceSlug[];
}

export interface AdminBlockUserRequest {
  blocked: boolean;
  reason?: string;
  /** ISO-дата; `null`/не указано при блокировке = бессрочно. */
  blockedUntil?: string | null;
}

export interface AdminDeleteUserRequest {
  reason: string;
  confirmSelfDelete?: boolean;
}

/**
 * Безвозвратное удаление: строка User и все сервисные данные сносятся
 * каскадом, файлы — из объектного хранилища. Отмены нет, поэтому
 * подтверждается точным вводом email аккаунта.
 */
export interface AdminPurgeUserRequest {
  reason: string;
  confirmEmail: string;
  confirmSelfDelete?: boolean;
}

export interface AdminPurgeUserResponse {
  id: string;
  email: string;
  /**
   * Что снесли сервисы: `{ photos: 4, listings: 2, notices: 1 }`. Набор ключей
   * задают сами сервисы, портал их только складывает.
   */
  counts: Record<string, number>;
  /** Сколько объектов удалено из хранилища. */
  storageObjects: number;
  /** Объекты, которые хранилище не отдало, — их придётся добить руками. */
  storageFailures: number;
}

export interface CommunityStats {
  totalMembers: number;
  /** Городов, где есть хотя бы один участник. */
  totalCities: number;
  /** Подтверждённых общин: храмы, ятры, нама-хатты. */
  totalCommunities: number;
}

/** Точка графика: день или месяц и сколько регистраций в нём. */
export interface PortalStatsPoint {
  /** `YYYY-MM-DD` для дней, `YYYY-MM` для месяцев. */
  period: string;
  count: number;
}

/**
 * Статистика портала для участников. Только портальные сущности: людей,
 * города, общины. Данные сервисов сюда не тянутся — портал не читает их
 * таблицы, см. контракт сервисного модуля.
 */
export interface PortalStats {
  people: {
    total: number;
    newLast7Days: number;
    newLast30Days: number;
    activeLast7Days: number;
  };
  /** Сколько людей на каждом этапе; `null` — этап не выбран. */
  stages: Array<{ stage: SpiritualStage | null; count: number }>;
  /** Города, где участников не меньше порога; остальные сведены в «другие». */
  cities: Array<{ city: string; count: number }>;
  /** Сколько людей в городах, не прошедших порог. */
  otherCitiesPeople: number;
  registrationsByDay: PortalStatsPoint[];
  registrationsByMonth: PortalStatsPoint[];
  communities: number;
}

/**
 * Меньше скольких человек город не показывается отдельно. При небольшом
 * портале город с одним участником — это почти имя и фамилия.
 */
export const CITY_PRIVACY_THRESHOLD = 3;

/** Одна строка очереди на главной админки: сколько ждёт разбора и куда идти. */
export interface AdminQueueCounter {
  key:
    | 'userReports'
    | 'supportTickets'
    | 'verificationRequests'
    | 'communities';
  count: number;
}

/**
 * Портальная сводка для главной админки. Сервисные счётчики сюда не попадают:
 * их отдают сами сервисы, портал в чужие таблицы не ходит.
 */
export interface AdminPortalStats {
  users: {
    total: number;
    active: number;
    blocked: number;
    newLast7Days: number;
    newLast30Days: number;
    seenLast24Hours: number;
    paidSubscriptions: number;
  };
  queues: AdminQueueCounter[];
}

// ===== Каталог сервисов портала (админка) =====

/**
 * Карточка сервиса глазами администрации: все флаги видимости, а не итог их
 * применения. Маркетинговые тексты лендинга сюда не входят — они живут в коде
 * (apps/web/src/lib/service-content.ts), здесь только сетка портала.
 */
export interface AdminServiceCardDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl: string | null;
  url: string;
  status: ServiceStatus;
  category: string;
  nameEn: string | null;
  sortOrder: number;
  /** `false` — сервис виден только по персональному доступу или по этапу. */
  public: boolean;
  seekerVisible: boolean;
  practitionerVisible: boolean;
  yogiVisible: boolean;
  devoteeSelfIdentifiedVisible: boolean;
  devoteeVerifiedVisible: boolean;
  /** Сколько человек получили персональный доступ к сервису. */
  personalAccessCount: number;
  updatedAt: string;
}

export type UpdateAdminServiceRequest = Partial<
  Pick<
    AdminServiceCardDto,
    | 'name'
    | 'description'
    | 'iconUrl'
    | 'url'
    | 'status'
    | 'category'
    | 'nameEn'
    | 'sortOrder'
    | 'public'
    | 'seekerVisible'
    | 'practitionerVisible'
    | 'yogiVisible'
    | 'devoteeSelfIdentifiedVisible'
    | 'devoteeVerifiedVisible'
  >
>;

export interface CreateAdminServiceRequest extends UpdateAdminServiceRequest {
  /** Задаётся один раз: слаг попадает в ссылки и потом не меняется. */
  slug: string;
  name: string;
  description: string;
  url: string;
  /** Группа в сетке портала; у существующих сервисов — `community`. */
  category: string;
}

// ===== Настройки платформы (админка) =====

/** Приём новых аккаунтов. `closed` не мешает входить уже заведённым. */
export type RegistrationMode = 'open' | 'closed';

/**
 * Внешняя интеграция глазами администрации. Значения ключей наружу не уходят
 * никогда — только факт настройки: этого достаточно, чтобы понять, почему
 * не идут пуши или не генерируются картинки.
 */
export interface AdminIntegrationStatus {
  key:
    | 'google-oauth'
    | 'storage'
    | 'push'
    | 'redis'
    | 'motivation-ai'
    | 'motivation-media'
    | 'astro-ai';
  /** Все обязательные переменные окружения заданы. */
  configured: boolean;
  /** Каких переменных не хватает. Имена, не значения. */
  missing: string[];
}

export interface AdminPlatformSettings {
  billingMode: BillingMode;
  registrationMode: RegistrationMode;
  registrationNote: string | null;
  integrations: AdminIntegrationStatus[];
  updatedAt: string | null;
}

export interface AdminUpdatePlatformSettingsRequest {
  billingMode?: BillingMode;
  registrationMode?: RegistrationMode;
  registrationNote?: string | null;
}

export const REGISTRATION_NOTE_MAX_LENGTH = 300;

/**
 * Название сервиса в нужной локали. Единственное место, где решается, какое
 * имя показывать: и лендинг, и шапка, и сетка портала зовут её, чтобы правка
 * в каталоге админки доезжала везде одинаково.
 */
export function serviceCardName(
  service: Pick<ServiceCard, 'name' | 'nameEn'>,
  locale: string,
): string {
  if (locale !== 'en') return service.name;
  return service.nameEn?.trim() || service.name;
}
