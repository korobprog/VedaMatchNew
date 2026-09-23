import { Prisma } from '@prisma/client';
import {
  BLOG_HOME_CAROUSEL_SIZE,
  BLOG_HOME_PREVIEW_SIZE,
} from '@vedamatch/shared';

/**
 * Порядок выдачи и курсор блог-ленты (VED-238).
 *
 * Порядок ленты — «закреплённое администратором наверху, дальше один за
 * другим, свежее выше». Участник на порядок не влияет вовсе: у него нет ни
 * закрепления, ни подъёма старого поста.
 *
 * Курсор несёт все три ключа сортировки, потому что первый из них —
 * булев: без `pinned` в курсоре вторая страница начиналась бы заново с
 * закреплённых постов.
 */

export const BLOG_PAGE_SIZE = 12;

export interface BlogCursor {
  pinned: boolean;
  createdAt: Date;
  id: string;
}

export interface BlogCursorRow {
  pinned: boolean;
  createdAt: Date;
  id: string;
}

export function encodeBlogCursor(row: BlogCursorRow): string {
  const payload = { p: row.pinned, c: row.createdAt.toISOString(), i: row.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * `null` на любой неожиданности: испорченный курсор должен вернуть первую
 * страницу, а не уронить ленту.
 */
export function decodeBlogCursor(
  cursor: string | undefined,
): BlogCursor | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as {
      p?: unknown;
      c?: unknown;
      i?: unknown;
    };
    if (typeof parsed.p !== 'boolean') return null;
    if (typeof parsed.c !== 'string') return null;
    if (typeof parsed.i !== 'string' || parsed.i === '') return null;
    const createdAt = new Date(parsed.c);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { pinned: parsed.p, createdAt, id: parsed.i };
  } catch {
    return null;
  }
}

/**
 * `id` последним ключом всегда: без него посты, опубликованные в одну
 * миллисекунду (сид, импорт), ломают курсорную пагинацию — страница
 * повторяет или пропускает строку.
 */
export function blogOrderBy(): Prisma.BlogPostOrderByWithRelationInput[] {
  return [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
}

/**
 * Сколько постов отдаёт виджет главной. Без параметра — прежние четыре:
 * их ждёт полоса в приложении, и сборки на телефонах параметр не шлют.
 * `carousel` — карусель веба (VED-238). Любое другое значение — как без него.
 */
export function blogHomeTake(view: string | undefined): number {
  return view === 'carousel' ? BLOG_HOME_CAROUSEL_SIZE : BLOG_HOME_PREVIEW_SIZE;
}

/** Условие «строго после курсора» для keyset-пагинации. */
export function blogCursorFilter(
  cursor: BlogCursor,
): Prisma.BlogPostWhereInput {
  const afterWithinSameGroup: Prisma.BlogPostWhereInput = {
    pinned: cursor.pinned,
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
  // Незакреплённые идут после закреплённых. Обратного перехода нет: из
  // хвоста ленты вернуться в закреплённую голову невозможно.
  if (cursor.pinned) {
    return { OR: [afterWithinSameGroup, { pinned: false }] };
  }
  return afterWithinSameGroup;
}

/** Отрезать лишнюю строку «есть ли ещё» и собрать следующий курсор. */
export function takeBlogPage<T extends BlogCursorRow>(
  rows: T[],
  pageSize: number = BLOG_PAGE_SIZE,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeBlogCursor(last) : null,
  };
}
