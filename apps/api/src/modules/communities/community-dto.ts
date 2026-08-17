import type { Community, CommunityMember } from '@prisma/client';
import {
  resolveDisplayName,
  type CommunityBadgeDto,
  type CommunityDto,
  type CommunityMapPoint,
  type CommunityMemberDto,
  type CommunityMembershipDto,
  type ProfileMessengers,
  type ProfileSocialLinks,
} from '@vedamatch/shared';

/**
 * Сборка DTO вынесена отдельным файлом по той же причине, что и в Рынке:
 * это чистые функции без Prisma-клиента, и правило «наружу не уезжает лишнее»
 * проверяется тестом напрямую.
 */

/** Поля общины, которых достаточно для любой карточки наружу. */
export type CommunityRow = Community;

export function toMembershipDto(
  member: CommunityMember,
): CommunityMembershipDto {
  return {
    id: member.id,
    communityId: member.communityId,
    role: member.role,
    status: member.status,
    title: member.title,
    isPrimary: member.isPrimary,
    isPublic: member.isPublic,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
  };
}

/**
 * Карточка общины. Координаты отдаются как есть: у храма адрес публичный, и
 * прятать его незачем — приватностное правило про центроид города касается
 * объявлений человека, а не общины.
 */
export function toCommunityDto(
  community: CommunityRow,
  membership: CommunityMember | null,
): CommunityDto {
  return {
    id: community.id,
    slug: community.slug,
    kind: community.kind,
    name: community.name,
    descriptionRu: community.descriptionRu,
    descriptionEn: community.descriptionEn,
    logoUrl: community.logoUrl,
    coverUrl: community.coverUrl,
    city: community.city,
    country: community.country,
    lat: community.latitude,
    lon: community.longitude,
    address: community.address,
    messengers: (community.messengers as ProfileMessengers | null) ?? {},
    links: (community.links as ProfileSocialLinks | null) ?? {},
    joinPolicy: community.joinPolicy,
    status: community.status,
    isVerified: community.verifiedAt !== null,
    membersCount: community.membersCount,
    createdAt: community.createdAt.toISOString(),
    membership: membership ? toMembershipDto(membership) : null,
  };
}

export function toBadgeDto(
  community: Pick<
    Community,
    'id' | 'slug' | 'name' | 'kind' | 'city' | 'verifiedAt'
  >,
  member: Pick<CommunityMember, 'role' | 'title' | 'isPrimary'>,
): CommunityBadgeDto {
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    kind: community.kind,
    city: community.city,
    isVerified: community.verifiedAt !== null,
    role: member.role,
    title: member.title,
    isPrimary: member.isPrimary,
  };
}

/** Пользователь в списке участников. Имя — всегда `resolveDisplayName`. */
export function toMemberDto(
  member: CommunityMember & {
    user: {
      name: string;
      spiritualName: string | null;
      avatarUrl: string | null;
      homeLocation: unknown;
    };
  },
): CommunityMemberDto {
  const location = member.user.homeLocation as { city?: string } | null;
  return {
    userId: member.userId,
    name: resolveDisplayName(member.user),
    avatarUrl: member.user.avatarUrl,
    city: location?.city ?? null,
    role: member.role,
    status: member.status,
    title: member.title,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
  };
}

/** Точка на карте. Общины без координат сюда не попадают — их считают отдельно. */
export function toMapPoint(community: CommunityRow): CommunityMapPoint | null {
  if (community.latitude === null || community.longitude === null) return null;
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    kind: community.kind,
    lat: community.latitude,
    lon: community.longitude,
    city: community.city,
    isVerified: community.verifiedAt !== null,
    membersCount: community.membersCount,
  };
}
