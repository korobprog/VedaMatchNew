import type { LibraryEntryType } from '@vedamatch/shared';

/**
 * Строка окна «Закладки» (VED-539): материал, отмеченный пользователем, —
 * только то, что нужно для списка названий со ссылками. Автора и прочего
 * наружу не отдаём: окну они не нужны.
 */
export type LibraryBookmarkListItem = {
  id: string;
  type: LibraryEntryType;
  titleRu: string | null;
  titleEn: string | null;
  bookmarkedAt: string;
};

export type LibraryBookmarkListResponse = {
  items: LibraryBookmarkListItem[];
};

/**
 * Сколько закладок отдаём за раз. Окно показывает все; предел — страховка от
 * ответа на мегабайты, человеку столько не отметить.
 */
export const BOOKMARK_LIST_LIMIT = 1000;

export type BookmarkRow = {
  createdAt: Date;
  entry: {
    id: string;
    type: LibraryEntryType;
    status: string;
    titleRu: string | null;
    titleEn: string | null;
  };
};

/**
 * Строки из базы — в ответ. Неопубликованное (снятое жалобами, черновик)
 * выпадает: ссылка на него привела бы к 404.
 */
export function toBookmarkList(
  rows: BookmarkRow[],
): LibraryBookmarkListResponse {
  return {
    items: rows
      .filter((row) => row.entry.status === 'published')
      .map((row) => ({
        id: row.entry.id,
        type: row.entry.type,
        titleRu: row.entry.titleRu,
        titleEn: row.entry.titleEn,
        bookmarkedAt: row.createdAt.toISOString(),
      })),
  };
}
