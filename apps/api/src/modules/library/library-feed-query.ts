import { Prisma } from '@prisma/client';

/**
 * Порядок ленты. `new` — «Свой порядок» страницы автора (VED-573): новое
 * сверху, как лента стояла всегда. `title` — «По алфавиту», по названию
 * материала: сначала русское, затем английское (у материала бывает одно
 * из двух), `id` — последним ключом, чтобы одинаковые названия не ломали
 * пагинацию. Общий `LibraryFeedSort` в shared описывает будущие
 * `actual`/`popular`, которых лента пока не умеет, поэтому тип здесь свой.
 */
export type FeedSort = 'new' | 'title';

const SORTS: FeedSort[] = ['new', 'title'];

export function resolveSort(sort: string | undefined): FeedSort {
  return SORTS.includes(sort as FeedSort) ? (sort as FeedSort) : 'new';
}

export function feedOrderBy(
  sort: FeedSort,
): Prisma.LibraryEntryOrderByWithRelationInput[] {
  if (sort === 'title') {
    return [
      { titleRu: { sort: 'asc', nulls: 'last' } },
      { titleEn: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ];
  }
  return [{ publishedAt: 'desc' }, { id: 'desc' }];
}

/**
 * Курсор алфавитной ленты — просто смещение: ключ из двух необязательных
 * названий в условие «после такого-то» не складывается без сырого SQL, а
 * лента автора — десятки материалов, и `skip` по ним дёшев. Помечен `s`,
 * чтобы курсор ленты «новое сверху» не приняли за смещение и наоборот.
 */
export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(
    JSON.stringify({ s: 'title', o: offset }),
    'utf8',
  ).toString('base64url');
}

export function decodeOffsetCursor(cursor: string | undefined): number | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { s?: unknown; o?: unknown };
    if (parsed.s !== 'title') return null;
    if (
      typeof parsed.o !== 'number' ||
      !Number.isInteger(parsed.o) ||
      parsed.o < 0
    ) {
      return null;
    }
    return parsed.o;
  } catch {
    return null;
  }
}

export function encodeCursor(value: { publishedAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ p: value.publishedAt.toISOString(), i: value.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined,
): { publishedAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { p?: unknown; i?: unknown };
    if (typeof parsed.p !== 'string' || typeof parsed.i !== 'string') {
      return null;
    }
    const publishedAt = new Date(parsed.p);
    if (Number.isNaN(publishedAt.getTime())) return null;
    return { publishedAt, id: parsed.i };
  } catch {
    return null;
  }
}
