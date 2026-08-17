import type {
  Community,
  Notice,
  NoticeImage,
  NoticeRubric,
} from '@prisma/client';
import {
  resolveDisplayName,
  type CommunityBadgeDto,
  type NoticeDto,
  type NoticeImageDto,
  type NoticeRubricDto,
} from '@vedamatch/shared';
import { canRenew } from './notice-expiry';

/**
 * Сборка DTO. Чистые функции без Prisma-клиента: правило «координаты дома
 * наружу не уезжают» проверяется тестом напрямую, а не через мок выдачи.
 */

export type NoticeRow = Notice & {
  rubric: NoticeRubric;
  images: NoticeImage[];
  author: {
    id: string;
    name: string;
    spiritualName: string | null;
    avatarUrl: string | null;
  };
  community: Pick<
    Community,
    'id' | 'slug' | 'name' | 'kind' | 'city' | 'verifiedAt'
  > | null;
};

export function toRubricDto(rubric: NoticeRubric): NoticeRubricDto {
  return {
    id: rubric.id,
    slug: rubric.slug,
    kinds: rubric.kinds,
    nameRu: rubric.nameRu,
    nameEn: rubric.nameEn,
    position: rubric.position,
    noticesCount: rubric.noticesCount,
  };
}

export function toImageDto(image: NoticeImage): NoticeImageDto {
  return {
    id: image.id,
    url: image.url,
    width: image.width,
    height: image.height,
    sortOrder: image.sortOrder,
  };
}

/**
 * Значок общины, от имени которой опубликовано объявление. Роль здесь
 * декоративная — карточка показывает саму общину, а не должность автора
 * в ней, поэтому `member` и `isPrimary: false` заданы константами.
 */
function toPostedAs(
  community: NoticeRow['community'],
): CommunityBadgeDto | null {
  if (!community) return null;
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    kind: community.kind,
    city: community.city,
    isVerified: community.verifiedAt !== null,
    role: 'member',
    title: null,
    isPrimary: false,
  };
}

export function toNoticeDto(
  row: NoticeRow,
  viewerId: string | null,
  now: Date,
): NoticeDto {
  // Координаты отдаются только у общественного места. У объявления человека
  // город есть, а точки нет: доска не должна показывать, где он живёт.
  const exact = row.placePrecision === 'exact';
  return {
    id: row.id,
    kind: row.kind,
    rubric: toRubricDto(row.rubric),
    titleRu: row.titleRu,
    titleEn: row.titleEn,
    descriptionRu: row.descriptionRu,
    descriptionEn: row.descriptionEn,
    audience: row.audience,

    city: row.city,
    country: row.country,
    lat: exact ? row.latitude : null,
    lon: exact ? row.longitude : null,
    placePrecision: row.placePrecision,

    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    timeZone: row.timeZone,
    venueName: row.venueName,
    isOnline: row.isOnline,
    onlineUrl: row.onlineUrl,
    repeat: row.repeat,
    repeatUntil: row.repeatUntil?.toISOString() ?? null,

    status: row.status,
    needsReview: row.needsReview,
    primaryImageUrl: row.primaryImageUrl,
    images: [...row.images]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toImageDto),

    author: {
      userId: row.author.id,
      // Имя собирает resolveDisplayName, а не user.name — правило контракта.
      name: resolveDisplayName(row.author),
      avatarUrl: row.author.avatarUrl,
      community: null,
    },
    postedAs: toPostedAs(row.community),

    publishedAt: row.publishedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    canRenew:
      row.authorId === viewerId &&
      canRenew(row.expiresAt, now, row.kind, row.startsAt),

    viewsCount: row.viewsCount,
    responsesCount: row.responsesCount,
    thanksCount: row.thanksCount,

    isMine: row.authorId === viewerId,
  };
}

/** Prisma-select автора: `spiritualName` обязателен рядом с любым DTO наружу. */
export const NOTICE_AUTHOR_SELECT = {
  id: true,
  name: true,
  spiritualName: true,
  avatarUrl: true,
} as const;

export const NOTICE_COMMUNITY_SELECT = {
  id: true,
  slug: true,
  name: true,
  kind: true,
  city: true,
  verifiedAt: true,
} as const;

export const NOTICE_INCLUDE = {
  rubric: true,
  images: true,
  author: { select: NOTICE_AUTHOR_SELECT },
  community: { select: NOTICE_COMMUNITY_SELECT },
} as const;
