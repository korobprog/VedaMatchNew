import type { LibraryFeedResponse } from "@vedamatch/shared";

/**
 * Данные карточки «Образования» на главной: свежий материал и темп
 * пополнения за неделю.
 *
 * Карточка показывает продукт, а не состояние, — как цитата дня во
 * «Вдохновении». Лента уже персональная (линия, язык), поэтому преданный
 * увидит свежее своей традиции, а не чужое. Чистый модуль без React по той
 * же причине, что `union-quick-access`: выбор и подсчёт проверяются тестом.
 */
export interface LibraryQuickAccessData {
  latest: {
    id: string;
    title: string;
    /** Тип материала, чтобы виджет подписал «видео», «книга». */
    type: LibraryFeedResponse["items"][number]["type"];
    /** Первая рубрика по-русски; null — не подписана. */
    rubric: string | null;
    /** Опубликован за последние семь дней — тогда подписываем «новое». */
    isFresh: boolean;
  } | null;
  /**
   * Сколько добавлено за семь дней. Считается по первой странице ленты,
   * поэтому больше её размера не бывает — тогда `weekCountCapped` = true и
   * виджет пишет «20+». 0 — строку не рисуем.
   */
  weekCount: number;
  weekCountCapped: boolean;
}

export const FRESH_WINDOW_DAYS = 7;

export function buildLibraryQuickAccess(
  feed: LibraryFeedResponse | null,
  now: Date = new Date(),
): LibraryQuickAccessData {
  const items = feed?.items ?? [];
  const first = items[0];
  if (!first) return { latest: null, weekCount: 0, weekCountCapped: false };

  const since = now.getTime() - FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const isFreshAt = (iso: string) => {
    const at = Date.parse(iso);
    return Number.isFinite(at) && at >= since;
  };

  const weekCount = items.filter((item) => isFreshAt(item.publishedAt)).length;
  // Все записи страницы свежие и есть следующая страница — считать дальше
  // незачем, честнее сказать «20+», чем ходить за всей лентой ради цифры.
  const weekCountCapped =
    weekCount === items.length && feed?.nextCursor !== null && weekCount > 0;

  return {
    latest: {
      id: first.id,
      title: first.titleRu?.trim() || first.titleEn?.trim() || first.domain || "Без названия",
      type: first.type,
      rubric: first.categories[0]?.titleRu?.trim() || first.categories[0]?.titleEn?.trim() || null,
      isFresh: isFreshAt(first.publishedAt),
    },
    weekCount,
    weekCountCapped,
  };
}
