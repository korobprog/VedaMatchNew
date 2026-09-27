import type { LibraryEntryType, LibraryLocale } from "@vedamatch/shared";
import { pickLocalized, t } from "./i18n";

/** Строка ответа `GET library/bookmarks` (VED-539). */
export type LibraryBookmarkItem = {
  id: string;
  type: LibraryEntryType;
  titleRu: string | null;
  titleEn: string | null;
  bookmarkedAt: string;
};

export type LibraryBookmarkListResponse = { items: LibraryBookmarkItem[] };

export type BookmarkLink = { id: string; href: string; title: string };

/**
 * Строки окна «Закладки»: полное название на языке интерфейса — без
 * обрезки, — и ссылка на материал. Пустого названия не бывает: без обоих
 * языков строка подписывается «Материал без названия», иначе ссылка вышла бы
 * без имени и для глаз, и для скринридера.
 */
export function bookmarkLinks(
  locale: LibraryLocale,
  items: LibraryBookmarkItem[],
): BookmarkLink[] {
  return items.map((item) => ({
    id: item.id,
    href: `/library/entry/${encodeURIComponent(item.id)}`,
    title:
      pickLocalized(locale, { ru: item.titleRu, en: item.titleEn }) ||
      t(locale, "bookmarks.untitled"),
  }));
}
