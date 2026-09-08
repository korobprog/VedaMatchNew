import type { Community, VacancyOffer, VacancyResponse } from '@prisma/client';
import {
  resolveDisplayName,
  type CommunityBadgeDto,
  type VacancyOfferDto,
  type VacancyResponseDto,
} from '@vedamatch/shared';
import { canRenew } from './vacancy-expiry';

/**
 * Сборка DTO. Чистые функции без Prisma-клиента: правило «координаты дома
 * наружу не уезжают» проверяется тестом напрямую, а не через мок выдачи.
 */

export const VACANCY_AUTHOR_SELECT = {
  id: true,
  name: true,
  // spiritualName обязателен рядом с любым DTO наружу — правило контракта.
  spiritualName: true,
  avatarUrl: true,
} as const;

export const VACANCY_COMMUNITY_SELECT = {
  id: true,
  slug: true,
  name: true,
  kind: true,
  city: true,
  verifiedAt: true,
} as const;

export const VACANCY_INCLUDE = {
  author: { select: VACANCY_AUTHOR_SELECT },
  community: { select: VACANCY_COMMUNITY_SELECT },
} as const;

export type OfferRow = VacancyOffer & {
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

/** Отклик смотрящего — чтобы карточка знала, что рисовать вместо кнопки. */
export type ViewerResponse = Pick<VacancyResponse, 'id' | 'status'> | null;

/**
 * Значок общины, от имени которой опубликовано. Роль декоративная: карточка
 * показывает саму общину, а не должность автора в ней.
 */
function toPostedAs(
  community: OfferRow['community'],
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

export function toOfferDto(
  row: OfferRow,
  viewerId: string | null,
  now: Date,
  myResponse: ViewerResponse = null,
): VacancyOfferDto {
  // Координаты отдаются только у общественного места. У предложения
  // человека город есть, а точки нет: лента не должна показывать, где он живёт.
  const exact = row.placePrecision === 'exact';
  const isMine = row.authorId === viewerId;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    audience: row.audience,

    city: row.city,
    country: row.country,
    lat: exact ? row.latitude : null,
    lon: exact ? row.longitude : null,
    placePrecision: row.placePrecision,
    isRemote: row.isRemote,

    workFormat: row.workFormat,
    employment: row.employment,
    schedule: row.schedule,
    pay:
      row.kind === 'work'
        ? {
            min: row.payMin,
            max: row.payMax,
            currency: row.payCurrency,
            period: row.payPeriod ?? 'month',
            negotiable: row.payNegotiable,
          }
        : null,

    sevaTerm: row.sevaTerm,
    sevaUntil: row.sevaUntil?.toISOString() ?? null,
    perks: row.perks,

    dueAt: row.dueAt?.toISOString() ?? null,

    status: row.status,
    // Причину скрытия видит автор и админ; остальным она ни к чему, да и
    // карточка до них в таком статусе не доходит.
    moderatorNote: isMine ? row.moderatorNote : null,

    author: {
      userId: row.author.id,
      name: resolveDisplayName(row.author),
      avatarUrl: row.author.avatarUrl,
    },
    postedAs: toPostedAs(row.community),

    publishedAt: row.publishedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    canRenew:
      isMine &&
      canRenew(row.expiresAt, now, {
        kind: row.kind,
        dueAt: row.dueAt,
        sevaUntil: row.sevaUntil,
      }),

    viewsCount: row.viewsCount,
    responsesCount: row.responsesCount,

    isMine,
    myResponse: myResponse
      ? { id: myResponse.id, status: myResponse.status }
      : null,
  };
}

export const RESPONSE_USER_SELECT = {
  id: true,
  name: true,
  spiritualName: true,
  avatarUrl: true,
  homeLocation: true,
} as const;

export const RESPONSE_INCLUDE = {
  offer: { select: { id: true, title: true, kind: true, authorId: true } },
  user: { select: RESPONSE_USER_SELECT },
} as const;

export type ResponseRow = VacancyResponse & {
  offer: Pick<VacancyOffer, 'id' | 'title' | 'kind' | 'authorId'>;
  user: {
    id: string;
    name: string;
    spiritualName: string | null;
    avatarUrl: string | null;
    homeLocation: unknown;
  };
};

export function toResponseDto(row: ResponseRow): VacancyResponseDto {
  const location = row.user.homeLocation as { city?: string } | null;
  return {
    id: row.id,
    offerId: row.offerId,
    offerTitle: row.offer.title,
    offerKind: row.offer.kind,
    offerAuthorId: row.offer.authorId,
    status: row.status,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    user: {
      userId: row.userId,
      name: resolveDisplayName(row.user),
      avatarUrl: row.user.avatarUrl,
      city: location?.city ?? null,
    },
  };
}
