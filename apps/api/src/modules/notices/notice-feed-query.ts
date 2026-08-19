import { Prisma } from '@prisma/client';
import type { NoticeKind } from '@vedamatch/shared';
import { NOTICE_KINDS } from './notice-validate';

/**
 * Разбор фильтров и курсорная пагинация ленты. Вынесено отдельным файлом по
 * той же причине, что в Рынке и в Контактах: это чистые функции без
 * Prisma-клиента, поэтому условие видимости проверяется тестами напрямую.
 *
 * Главное правило: выдача строится из ОДНОГО `where`. Фильтрации после
 * выборки нет нигде — она дырявит курсорную пагинацию.
 */

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 120;

export interface NormalizedFeedFilters {
  q: string | null;
  kind: NoticeKind | null;
  rubric: string | null;
  city: string | null;
  country: string | null;
  communityId: string | null;
  /**
   * Идентификаторы, попавшие в радиус. Радиус применяется двумя шагами:
   * сначала SQL с рамкой и гаверсинусом отдаёт id, потом они входят в общий
   * `where`. Так курсорная пагинация по-прежнему строится из ОДНОГО условия.
   * `null` — фильтра по радиусу нет.
   */
  radiusIds: string[] | null;
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
    kind: NOTICE_KINDS.includes(query.kind as NoticeKind)
      ? (query.kind as NoticeKind)
      : null,
    rubric: trimOrNull(query.rubric),
    city: trimOrNull(query.city),
    country: trimOrNull(query.country),
    communityId: trimOrNull(query.communityId),
    // Радиус резолвится в сервисе — тут только место под результат.
    radiusIds: null,
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

/**
 * `id` вторым ключом всегда: без него объявления с одинаковой секундой
 * публикации начинают повторяться и пропадать между страницами.
 */
export function feedOrderBy(): Prisma.NoticeOrderByWithRelationInput[] {
  return [{ publishedAt: 'desc' }, { id: 'desc' }];
}

export function cursorFilter(cursor: FeedCursor): Prisma.NoticeWhereInput {
  return {
    OR: [
      { publishedAt: { lt: cursor.publishedAt } },
      { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
    ],
  };
}

/**
 * Смотрящий всегда авторизован: доска гостю не открыта (см.
 * docs/notices-service-plan.md), поэтому `userId` обязателен.
 */
export interface FeedViewer {
  userId: string;
  isAdmin: boolean;
  /** Город смотрящего из портального профиля — для аудитории `my_city`. */
  city: string | null;
  /** Общины, в которых он состоит, — для аудитории `my_community`. */
  communityIds: string[];
  /**
   * Авторы, которых смотрящему показывать нельзя: блокировки в обе стороны
   * плюс односторонние скрытия со скоупом `all` — из `moderation`.
   * Блокировка обязана действовать во всех сервисах сразу, доска не
   * исключение: иначе заблокированный продолжал бы «говорить» через
   * объявления.
   */
  hiddenUserIds: ReadonlySet<string>;
}

/**
 * Условие видимости и фильтров одним выражением.
 *
 * `now` передаётся, а не берётся внутри: живость объявления определяется
 * данными, а не тем, успел ли отработать воркер протухания. Остановленный
 * воркер оставит устаревшие счётчики, но мёртвое объявление в ленту не пустит.
 */
export function buildFeedWhere(
  filters: NormalizedFeedFilters,
  viewer: FeedViewer,
  now: Date,
): Prisma.NoticeWhereInput {
  const and: Prisma.NoticeWhereInput[] = [];

  if (filters.mine) {
    // Свой кабинет: все статусы, но только свои записи.
    and.push({ authorId: viewer.userId });
    and.push({ status: { notIn: ['removed_by_admin'] } });
  } else {
    and.push({ status: 'published' });
    and.push({ expiresAt: { gt: now } });
    and.push(audienceWhere(viewer));
    // Исключение заблокированных живёт в SQL, а не в фильтре после
    // выборки — по той же причине, что и аудитория: иначе дырявится
    // курсорная пагинация. Админ видит всё, как и по аудитории: иначе
    // достаточно было бы заблокировать админа, чтобы спрятать от него доску.
    if (!viewer.isAdmin && viewer.hiddenUserIds.size)
      and.push({ authorId: { notIn: [...viewer.hiddenUserIds] } });
  }

  if (filters.kind) and.push({ kind: filters.kind });
  if (filters.rubric) and.push({ rubric: { slug: filters.rubric } });
  if (filters.city)
    and.push({ city: { equals: filters.city, mode: 'insensitive' } });
  if (filters.country)
    and.push({ country: { equals: filters.country, mode: 'insensitive' } });
  if (filters.communityId) and.push({ communityId: filters.communityId });
  if (filters.radiusIds) and.push({ id: { in: filters.radiusIds } });
  if (filters.q)
    and.push({
      OR: [
        { titleRu: { contains: filters.q, mode: 'insensitive' } },
        { titleEn: { contains: filters.q, mode: 'insensitive' } },
        { descriptionRu: { contains: filters.q, mode: 'insensitive' } },
      ],
    });

  return { AND: and };
}

/**
 * Кому какое объявление показывать. Это условие живёт в SQL, а не в фильтре
 * после выборки: иначе «только моей общине» протекло бы через пагинацию.
 */
function audienceWhere(viewer: FeedViewer): Prisma.NoticeWhereInput {
  if (viewer.isAdmin) return {};
  const options: Prisma.NoticeWhereInput[] = [{ audience: 'everyone' }];
  if (viewer.city)
    options.push({
      audience: 'my_city',
      city: { equals: viewer.city, mode: 'insensitive' },
    });
  if (viewer.communityIds.length)
    options.push({
      audience: 'my_community',
      communityId: { in: viewer.communityIds },
    });
  // Своё объявление автор видит в ленте всегда, каким бы узким ни был круг.
  options.push({ authorId: viewer.userId });
  return { OR: options };
}

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
