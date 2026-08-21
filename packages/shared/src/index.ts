export * from './vedabase';
export * from './gitabase';
export * from './union';
export * from './library';
export * from './video-embed';
export * from './motivation';
export * from './moderation';
export * from './contacts';
export * from './support';
export * from './notifications';
export * from './astro';
export * from './astro-chart';
export * from './astro-reading';
export * from './astro-admin';
export * from './astro-compatibility';
export * from './astro-transit';
export * from './changelog';
export * from './market';
export * from './community';
export * from './notices';

import type { SubscriptionState } from './support';

export type Role = 'user' | 'admin' | 'service-admin';

/**
 * Сервисы, у которых есть собственный раздел админки. Роль `service-admin`
 * получает права ровно на те из них, что перечислены в `adminServices`.
 * Портальные разделы (пользователи, биллинг, поддержка, сообщества,
 * changelog, настройки) в список не входят — они только для роли `admin`.
 */
export const ADMIN_SERVICE_SLUGS = [
  'union',
  'market',
  'motivation',
  'library',
  'notices',
  'astro',
  'contacts',
  'vedabase',
] as const;

export type AdminServiceSlug = (typeof ADMIN_SERVICE_SLUGS)[number];

/** Есть ли у аккаунта доступ хоть к какой-то части админки. */
export function isPortalAdmin(user: { role: Role }): boolean {
  return user.role === 'admin' || user.role === 'service-admin';
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
  homeLocation: ProfileLocation | null;
  socialLinks: ProfileSocialLinks;
  messengers: ProfileMessengers;
  role: Role;
  /** Слаги сервисов, которыми управляет `service-admin`; у остальных ролей пусто. */
  adminServices: string[];
  spiritualStage: SpiritualStage | null;
  devoteeVerificationStatus: DevoteeVerificationStatus | null;
  lastSelfIdentificationAt: string | null;
  subscription: SubscriptionState;
  accountStatus: UserAccountStatus;
  /** Задано, если пользователь сам запросил удаление аккаунта. */
  pendingDeletionAt: string | null;
  /** `pendingDeletionAt` + окно на отмену; после этой даты удаление финализируется. */
  deletionEligibleAt: string | null;
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
  homeLocation?: ProfileLocation | null;
  socialLinks?: ProfileSocialLinks;
  messengers?: ProfileMessengers;
}

export interface GeoSearchResult extends ProfileLocation {
  type?: string;
}

export interface ServiceCard {
  id: string;
  slug: string;
  name: string;
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
  createdAt: string;
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
}

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
