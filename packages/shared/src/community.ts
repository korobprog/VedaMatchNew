// Портальная сущность «община»: ятры, храмы, нама-хатты, клубы.
// Не сервис, а инфраструктура — см. docs/notices-service-plan.md и
// docs/service-module-contract.md.
import type { ProfileLocation, ProfileMessengers, ProfileSocialLinks } from './index';

export type CommunityKind =
  | 'yatra'
  | 'temple'
  | 'ashram'
  | 'nama_hatta'
  | 'farm'
  | 'club'
  | 'center'
  | 'project';

/**
 * `pending` — заявка ждёт разбора администрацией. Свободное создание закрыто:
 * справочник ятр зарастает дублями быстрее всего остального.
 */
export type CommunityStatus =
  | 'draft'
  | 'pending'
  | 'active'
  | 'paused'
  | 'archived'
  | 'hidden_by_reports'
  | 'removed_by_admin';

export type CommunityJoinPolicy = 'open' | 'request_approval' | 'invite_only';

/** `moderator` — делегированная модерация Объявлений своей общины. */
export type CommunityMemberRole = 'owner' | 'admin' | 'moderator' | 'member';

/** `left` — ушёл сам и может вернуться; `removed` — исключён, возвращает админ. */
export type CommunityMemberStatus =
  | 'pending'
  | 'active'
  | 'declined'
  | 'left'
  | 'removed';

export const COMMUNITY_NAME_MAX_LENGTH = 120;
export const COMMUNITY_DESCRIPTION_MAX_LENGTH = 4000;
export const COMMUNITY_MEMBER_TITLE_MAX_LENGTH = 60;
export const COMMUNITY_JOIN_MESSAGE_MAX_LENGTH = 500;

/** Сколько заявок на вступление человек может отправить за сутки. */
export const COMMUNITY_JOIN_REQUESTS_PER_DAY = 10;

/**
 * Карточка общины в справочнике. Способы связи здесь есть намеренно:
 * у общины, в отличие от человека, контакты публичные — храм для того и
 * заводит карточку, чтобы до него можно было дозвониться.
 */
export interface CommunityDto {
  id: string;
  slug: string;
  kind: CommunityKind;
  name: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  city: string | null;
  country: string | null;
  /** Заполнены только у общин с публичной точкой; иначе карта берёт город. */
  lat: number | null;
  lon: number | null;
  address: string | null;
  messengers: ProfileMessengers;
  links: ProfileSocialLinks;
  joinPolicy: CommunityJoinPolicy;
  status: CommunityStatus;
  isVerified: boolean;
  membersCount: number;
  createdAt: string;
  /** Моё отношение к этой общине. null — я в ней никак не участвую. */
  membership: CommunityMembershipDto | null;
}

/** Короткая форма для значка в профиле и в карточках других сервисов. */
export interface CommunityBadgeDto {
  id: string;
  slug: string;
  name: string;
  kind: CommunityKind;
  city: string | null;
  isVerified: boolean;
  role: CommunityMemberRole;
  title: string | null;
  /** Эта община показывается значком в профиле. */
  isPrimary: boolean;
}

export interface CommunityMembershipDto {
  id: string;
  communityId: string;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
  title: string | null;
  /** Эта община показывается значком в профиле. Ровно одна на человека. */
  isPrimary: boolean;
  isPublic: boolean;
  joinedAt: string | null;
  createdAt: string;
}

/** Своё членство: что человек может поменять сам, без админа общины. */
export interface UpdateMembershipRequest {
  isPrimary?: boolean;
  isPublic?: boolean;
  title?: string | null;
}

/**
 * Предложение передать владение общиной. Отдельная сущность, а не поле:
 * принимающий должен согласиться — ответственность за модерацию нельзя
 * навесить молча.
 */
export interface CommunityTransferDto {
  id: string;
  communityId: string;
  communityName: string;
  fromUserName: string;
  toUserName: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
}

export interface CreateTransferRequest {
  toUserId: string;
}

/** Участник в списке общины. Имя — всегда resolveDisplayName. */
export interface CommunityMemberDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
  title: string | null;
  joinedAt: string | null;
  createdAt: string;
}

export interface CommunityMembersResponse {
  items: CommunityMemberDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CommunitySearchFilters {
  q?: string;
  city?: string;
  country?: string;
  kinds?: CommunityKind[];
  verifiedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CommunitySearchResponse {
  items: CommunityDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/**
 * Точка справочника на карте. В отличие от карты «Контактов», здесь это
 * настоящая община с адресом, а не агрегат по городу: у храма есть место,
 * и скрывать его незачем.
 */
export interface CommunityMapPoint {
  id: string;
  slug: string;
  name: string;
  kind: CommunityKind;
  lat: number;
  lon: number;
  city: string | null;
  isVerified: boolean;
  membersCount: number;
}

export interface CommunityMapResponse {
  points: CommunityMapPoint[];
  /** Сколько подходящих общин без координат — карта скажет об этом честно. */
  withoutLocation: number;
}

export interface CreateCommunityRequest {
  kind: CommunityKind;
  name: string;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  location?: ProfileLocation | null;
  address?: string | null;
  messengers?: ProfileMessengers;
  links?: ProfileSocialLinks;
  joinPolicy?: CommunityJoinPolicy;
}

export interface UpdateCommunityRequest {
  kind?: CommunityKind;
  name?: string;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  location?: ProfileLocation | null;
  address?: string | null;
  messengers?: ProfileMessengers;
  links?: ProfileSocialLinks;
  joinPolicy?: CommunityJoinPolicy;
  /** Только `active` ↔ `paused` и `archived`: разбор заявок — дело админа. */
  status?: Extract<CommunityStatus, 'active' | 'paused' | 'archived'>;
}

export interface JoinCommunityRequest {
  message?: string | null;
}

export interface RespondToMemberRequest {
  accept: boolean;
}

export interface UpdateMemberRequest {
  role?: CommunityMemberRole;
  title?: string | null;
}

/** Что портал знает о моих общинах: для профиля и для значков. */
export interface MyCommunitiesResponse {
  /** Подтверждённое участие. */
  memberships: CommunityBadgeDto[];
  /** Мои неразобранные заявки — чтобы профиль показал «заявка отправлена». */
  pending: CommunityBadgeDto[];
}

export interface AdminCommunityListItem extends CommunityDto {
  createdById: string | null;
  /** Мирское имя заявителя: в админке нужно понимать, кто перед тобой. */
  createdByName: string | null;
  updatedAt: string;
}

export interface AdminCommunityListResponse {
  items: AdminCommunityListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminCommunityDecisionRequest {
  /** `approve` переводит в `active`, `reject` — в `removed_by_admin`. */
  decision: 'approve' | 'reject';
  /** Верифицировать сразу же: «это действительно та община». */
  verify?: boolean;
  reason?: string | null;
}
