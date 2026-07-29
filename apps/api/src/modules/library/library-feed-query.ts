import { Prisma } from '@prisma/client';
import type { LibraryFeedSort } from '@vedamatch/shared';

const SORTS: LibraryFeedSort[] = ['new'];

export function resolveSort(sort: string | undefined): LibraryFeedSort {
  return SORTS.includes(sort as LibraryFeedSort)
    ? (sort as LibraryFeedSort)
    : 'new';
}

/**
 * `id` вторым ключом — иначе одинаковые значения ломают курсорную пагинацию.
 * В фазе A `resolveSort` всегда даёт `new`, поэтому порядок один; параметр
 * оставлен, чтобы фаза B добавила ветки `actual`/`popular` без правки вызовов.
 */
export function feedOrderBy(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sort: LibraryFeedSort,
): Prisma.LibraryEntryOrderByWithRelationInput[] {
  return [{ publishedAt: 'desc' }, { id: 'desc' }];
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
