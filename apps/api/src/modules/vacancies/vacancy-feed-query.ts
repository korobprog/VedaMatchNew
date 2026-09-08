import { Prisma } from '@prisma/client';
import type { VacancyKind } from '@vedamatch/shared';
import { normalizeCityKey } from '../../common/city-key';
import { VACANCY_KINDS } from './vacancy-validate';

/**
 * Разбор фильтров и курсорная пагинация ленты. Чистые функции без
 * Prisma-клиента, чтобы условие видимости проверялось тестами напрямую —
 * тот же приём, что в Объявлениях и Рынке.
 *
 * Главное правило: выдача строится из ОДНОГО `where`. Фильтрации после
 * выборки нет нигде — она дырявит курсорную пагинацию.
 */

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 120;

export interface NormalizedFeedFilters {
  q: string | null;
  kind: VacancyKind | null;
  city: string | null;
  /** Только удалённые или «из любого города». */
  remote: boolean;
  /** Только от общин. */
  communityOnly: boolean;
  communityId: string | null;
  mine: boolean;
  cursor: string | undefined;
  limit: number;
}

export function parseFeedFilters(
  query: Record<string, string | undefined>,
): NormalizedFeedFilters {
  const limit = Number(query.limit);
  return {
    q: trimOrNull(query.q)?.slice(0, MAX_QUERY_LENGTH) ?? null,
    kind: VACANCY_KINDS.includes(query.kind as VacancyKind)
      ? (query.kind as VacancyKind)
      : null,
    city: trimOrNull(query.city),
    remote: query.remote === 'true',
    communityOnly: query.communityOnly === 'true',
    communityId: trimOrNull(query.communityId),
    mine: query.mine === 'true',
    cursor: query.cursor || undefined,
    limit:
      Number.isFinite(limit) && limit > 0
        ? Math.min(MAX_PAGE_SIZE, Math.floor(limit))
        : PAGE_SIZE,
  };
}

export interface FeedCursor {
  publishedAt: Date;
  id: string;
}

export function encodeCursor(row: { publishedAt: Date; id: string }): string {
  const payload = { p: row.publishedAt.toISOString(), i: row.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * `null` на любой неожиданности: испорченный курсор должен вернуть первую
 * страницу, а не уронить ленту.
 */
export function decodeCursor(cursor: string | undefined): FeedCursor | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { p?: unknown; i?: unknown };
    if (typeof parsed.i !== 'string' || typeof parsed.p !== 'string')
      return null;
    const publishedAt = new Date(parsed.p);
    if (Number.isNaN(publishedAt.getTime())) return null;
    return { publishedAt, id: parsed.i };
  } catch {
    return null;
  }
}

/** `id` вторым ключом всегда: иначе записи одной секунды дублируются. */
export function feedOrderBy(): Prisma.VacancyOfferOrderByWithRelationInput[] {
  return [{ publishedAt: 'desc' }, { id: 'desc' }];
}

export function cursorFilter(
  cursor: FeedCursor,
): Prisma.VacancyOfferWhereInput {
  return {
    OR: [
      { publishedAt: { lt: cursor.publishedAt } },
      { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
    ],
  };
}

/** Смотрящий всегда авторизован: лента гостю не открыта. */
export interface FeedViewer {
  userId: string;
  isAdmin: boolean;
  /** Город смотрящего из портального профиля — для аудитории `my_city`. */
  city: string | null;
  /** Общины, в которых он состоит, — для аудитории `my_community`. */
  communityIds: string[];
  /**
   * Авторы, которых смотрящему показывать нельзя: блокировки в обе стороны
   * плюс скрытия со скоупом `all` — из `moderation`. Блокировка действует во
   * всех сервисах сразу.
   */
  hiddenUserIds: ReadonlySet<string>;
}

/**
 * Условие видимости и фильтров одним выражением.
 *
 * `now` передаётся, а не берётся внутри: живость определяется данными, а не
 * тем, успел ли отработать воркер протухания.
 */
export function buildFeedWhere(
  filters: NormalizedFeedFilters,
  viewer: FeedViewer,
  now: Date,
): Prisma.VacancyOfferWhereInput {
  const and: Prisma.VacancyOfferWhereInput[] = [];

  if (filters.mine) {
    // Свой кабинет: все статусы, но только свои записи.
    and.push({ authorId: viewer.userId });
    and.push({ status: { notIn: ['removed_by_admin'] } });
  } else {
    and.push({ status: 'published' });
    and.push({ expiresAt: { gt: now } });
    and.push(audienceWhere(viewer));
    // Исключение заблокированных живёт в SQL, а не в фильтре после выборки.
    // Админ видит всё: иначе достаточно заблокировать админа, чтобы спрятать
    // от него ленту.
    if (!viewer.isAdmin && viewer.hiddenUserIds.size)
      and.push({ authorId: { notIn: [...viewer.hiddenUserIds] } });
  }

  if (filters.kind) and.push({ kind: filters.kind });
  if (filters.remote) and.push({ isRemote: true });
  // Город по нормализованному ключу (btree по cityKey). Удалённые
  // предложения показываются в любом городе: они «из любого города».
  if (filters.city && !filters.remote)
    and.push({
      OR: [{ cityKey: normalizeCityKey(filters.city) }, { isRemote: true }],
    });
  if (filters.communityOnly) and.push({ communityId: { not: null } });
  if (filters.communityId) and.push({ communityId: filters.communityId });
  if (filters.q)
    and.push({
      OR: [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
      ],
    });

  return { AND: and };
}

/**
 * Кому какое предложение показывать. Живёт в SQL, а не в фильтре после
 * выборки: иначе «только моей общине» протекло бы через пагинацию.
 */
function audienceWhere(viewer: FeedViewer): Prisma.VacancyOfferWhereInput {
  if (viewer.isAdmin) return {};
  const options: Prisma.VacancyOfferWhereInput[] = [{ audience: 'everyone' }];
  if (viewer.city)
    options.push({
      audience: 'my_city',
      cityKey: normalizeCityKey(viewer.city),
    });
  if (viewer.communityIds.length)
    options.push({
      audience: 'my_community',
      communityId: { in: viewer.communityIds },
    });
  // Своё предложение автор видит в ленте всегда, каким бы узким ни был круг.
  options.push({ authorId: viewer.userId });
  return { OR: options };
}

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
