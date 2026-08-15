import { Prisma } from '@prisma/client';
import type { MarketListingSort } from '@vedamatch/shared';

export const PAGE_SIZE = 20;

const SORTS: MarketListingSort[] = ['new', 'price_asc', 'price_desc', 'popular'];

export function resolveSort(sort: string | undefined): MarketListingSort {
  return SORTS.includes(sort as MarketListingSort)
    ? (sort as MarketListingSort)
    : 'new';
}

/**
 * Курсор дискриминирован по сортировке: ключ у «нового» — дата, у ценовых —
 * цена, у популярного — счётчик избранного. Хранить их в одной форме нельзя,
 * а перепутать ветки — значит молча отдать не ту страницу, поэтому сортировка
 * лежит внутри курсора и сверяется при разборе.
 */
export type MarketCursor =
  | { sort: 'new'; publishedAt: Date; id: string }
  | { sort: 'price_asc' | 'price_desc'; priceMinor: number | null; id: string }
  | { sort: 'popular'; favoritesCount: number; id: string };

type CursorRow = {
  id: string;
  publishedAt: Date;
  priceMinor: number | null;
  favoritesCount: number;
};

export function encodeCursor(sort: MarketListingSort, row: CursorRow): string {
  const payload =
    sort === 'new'
      ? { s: 'new', p: row.publishedAt.toISOString(), i: row.id }
      : sort === 'popular'
        ? { s: 'popular', v: row.favoritesCount, i: row.id }
        : { s: sort, v: row.priceMinor, i: row.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * `null` на любой неожиданности: испорченный курсор должен вернуть первую
 * страницу, а не уронить ленту. Курсор от другой сортировки тоже отбрасываем —
 * пользователь переключил сортировку, значит листает заново.
 */
export function decodeCursor(
  cursor: string | undefined,
  sort: MarketListingSort,
): MarketCursor | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { s?: unknown; p?: unknown; v?: unknown; i?: unknown };
    if (typeof parsed.i !== 'string' || parsed.s !== sort) return null;

    if (sort === 'new') {
      if (typeof parsed.p !== 'string') return null;
      const publishedAt = new Date(parsed.p);
      if (Number.isNaN(publishedAt.getTime())) return null;
      return { sort: 'new', publishedAt, id: parsed.i };
    }

    if (sort === 'popular') {
      if (typeof parsed.v !== 'number' || !Number.isFinite(parsed.v)) return null;
      return { sort: 'popular', favoritesCount: parsed.v, id: parsed.i };
    }

    // Ценовые сортировки: null — легальное значение, это «цена договорная».
    if (parsed.v !== null && (typeof parsed.v !== 'number' || !Number.isFinite(parsed.v))) {
      return null;
    }
    return { sort, priceMinor: parsed.v as number | null, id: parsed.i };
  } catch {
    return null;
  }
}

/**
 * `id` последним ключом всегда: без него одинаковые цены или даты ломают
 * курсорную пагинацию — записи начинают повторяться и пропадать между
 * страницами. `nulls: 'last'` на ценовых сортировках уводит «договорную»
 * и «даром» в конец: у них цены нет, и в начале ценового списка им не место.
 */
export function feedOrderBy(
  sort: MarketListingSort,
): Prisma.MarketListingOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ priceMinor: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }];
    case 'price_desc':
      return [{ priceMinor: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    case 'popular':
      return [{ favoritesCount: 'desc' }, { id: 'desc' }];
    case 'new':
    default:
      return [{ publishedAt: 'desc' }, { id: 'desc' }];
  }
}

/**
 * Условие «строго после курсора» для keyset-пагинации.
 *
 * Записи без цены отсортированы в конец, поэтому при движении по ценовому
 * списку они образуют отдельный хвост: пока курсор стоит на строке с ценой,
 * хвост ещё впереди; как только курсор попал в хвост, остаются только строки
 * без цены с меньшим id. Иначе безценовые записи выпали бы из выдачи.
 */
export function cursorFilter(
  cursor: MarketCursor,
): Prisma.MarketListingWhereInput {
  if (cursor.sort === 'new') {
    return {
      OR: [
        { publishedAt: { lt: cursor.publishedAt } },
        { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
      ],
    };
  }

  if (cursor.sort === 'popular') {
    return {
      OR: [
        { favoritesCount: { lt: cursor.favoritesCount } },
        { favoritesCount: cursor.favoritesCount, id: { lt: cursor.id } },
      ],
    };
  }

  if (cursor.priceMinor === null) {
    // Курсор уже в хвосте без цены — дальше только такие же, по убыванию id.
    return { priceMinor: null, id: { lt: cursor.id } };
  }

  const beyond =
    cursor.sort === 'price_asc'
      ? { priceMinor: { gt: cursor.priceMinor } }
      : { priceMinor: { lt: cursor.priceMinor } };

  return {
    OR: [
      beyond,
      { priceMinor: cursor.priceMinor, id: { lt: cursor.id } },
      // Хвост без цены идёт после любой строки с ценой при обеих сортировках.
      { priceMinor: null },
    ],
  };
}
