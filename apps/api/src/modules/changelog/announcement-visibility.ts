/**
 * Когда новость видна на портале.
 *
 * Расписание считается при выдаче, а не планировщиком: сравнить две даты с
 * `now()` дешевле, чем держать крон, а пропущенный тик не оставит объявление
 * невышедшим и не продлит просроченное. Цена — фильтр в двух местах, поэтому
 * правило живёт здесь, а не переписывается в каждом запросе.
 */

export type AnnouncementSchedule = {
  status: string;
  publishedAt: Date | null;
  publishAt: Date | null;
  expiresAt: Date | null;
};

/** Условие Prisma: опубликованные, чей срок начался и ещё не кончился. */
export function visibleAnnouncementWhere(now: Date) {
  return {
    status: 'published' as const,
    AND: [
      { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };
}

/** То же правило для уже загруженной записи. */
export function isAnnouncementVisible(
  item: AnnouncementSchedule,
  now: Date,
): boolean {
  if (item.status !== 'published') return false;
  if (item.publishAt && item.publishAt.getTime() > now.getTime()) return false;
  if (item.expiresAt && item.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Дата, по которой новость встаёт в списке.
 *
 * У отложенной это назначенное время: оно и есть «когда вышла». Иначе —
 * фактическая публикация, а у совсем старых записей, где её не проставили, —
 * дата создания.
 */
export function announcementSortDate(item: {
  publishAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
}): Date {
  return item.publishAt ?? item.publishedAt ?? item.createdAt;
}
