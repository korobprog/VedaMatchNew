import type { MotivationVideoCategoryDto } from '@vedamatch/shared';

/**
 * Лента «Видео» (VED-246): постраничная выдача и меню категорий.
 *
 * Порядок простой — от новых к старым. Курсор ключевой, по паре
 * (createdAt, id): смещение `skip` съезжало бы, как только редакция загрузит
 * новый ролик, пока человек листает, — и ролик на стыке страниц показался бы
 * дважды.
 */

export const DEFAULT_VIDEO_PAGE = 10;
export const MAX_VIDEO_PAGE = 30;

export type VideoCursor = { createdAt: Date; id: string };

export function encodeVideoCursor(cursor: VideoCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

/** Битый курсор — первая страница, а не ошибка: ссылку могли обрезать. */
export function decodeVideoCursor(
  raw: string | undefined | null,
): VideoCursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as unknown;
    if (!value || typeof value !== 'object') return null;
    const { t, id } = value as Record<string, unknown>;
    if (typeof t !== 'string' || typeof id !== 'string' || !id) return null;
    const createdAt = new Date(t);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Размер страницы из параметра: мусор — по умолчанию, край — потолок. */
export function videoPageSize(raw: string | undefined | null): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_VIDEO_PAGE;
  return Math.min(value, MAX_VIDEO_PAGE);
}

/** Условие «после курсора» для порядка `createdAt desc, id desc`. */
export function videoCursorWhere(cursor: VideoCursor | null) {
  if (!cursor) return null;
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/**
 * Страница из выборки на одну запись больше лимита: лишняя говорит, что
 * дальше что-то есть, и сама не показывается.
 */
export function videoPage<T extends { createdAt: Date; id: string }>(
  rows: readonly T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeVideoCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

/**
 * Меню категорий ленты «Видео» — из того же справочника, что у афоризмов.
 *
 * Только папки, где есть ролики: кнопка в пустую ленту — тупик. Родитель
 * непустой подпапки остаётся, даже если сам пуст, — иначе подпапке не к чему
 * крепиться. Вход — плоский список в порядке обхода дерева, выход в том же
 * порядке.
 */
export function videoCategoryMenu(
  categories: readonly {
    id: string;
    slug: string;
    title: string;
    parentId: string | null;
  }[],
  counts: ReadonlyMap<string, number>,
): MotivationVideoCategoryDto[] {
  const ids = new Set(categories.map((category) => category.id));
  const visible = new Set(
    categories
      .filter((category) => (counts.get(category.slug) ?? 0) > 0)
      .map((category) => category.id),
  );
  for (const category of categories)
    if (
      visible.has(category.id) &&
      category.parentId &&
      ids.has(category.parentId)
    )
      visible.add(category.parentId);
  return categories
    .filter((category) => visible.has(category.id))
    .map((category) => ({
      id: category.id,
      slug: category.slug,
      title: category.title,
      parentId:
        category.parentId && ids.has(category.parentId)
          ? category.parentId
          : null,
      videoCount: counts.get(category.slug) ?? 0,
    }));
}
