import type {
  ChangelogAnnouncementPublishedEvent,
  ChangelogAnnouncementWithdrawnEvent,
} from '@vedamatch/shared';

/**
 * События шины о новостях из админки. Чистый модуль: какое событие и с чем
 * уходит после сохранения, решается здесь, а сервис только публикует.
 *
 * Имена — литералы: значения из @vedamatch/shared на сервер не вывозятся, а
 * подписчик («Общение») повторяет их у себя тем же приёмом.
 */
export const ANNOUNCEMENT_PUBLISHED = 'changelog.announcement.published';
export const ANNOUNCEMENT_WITHDRAWN = 'changelog.announcement.withdrawn';

/** Где новости читают на портале: вкладка «Новости» раздела «Обновления». */
export const ANNOUNCEMENTS_PATH = '/updates/news';

export type AnnouncementEventSource = {
  id: string;
  status: string;
  titleRu: string;
  bodyRu: string;
  publishAt: Date | null;
  expiresAt: Date | null;
  images: { url: string; width: number; height: number }[];
};

export type AnnouncementBusEvent =
  | {
      name: typeof ANNOUNCEMENT_PUBLISHED;
      payload: ChangelogAnnouncementPublishedEvent;
    }
  | {
      name: typeof ANNOUNCEMENT_WITHDRAWN;
      payload: ChangelogAnnouncementWithdrawnEvent;
    };

/**
 * Что сообщить шине после сохранения новости.
 *
 * Опубликованная — событие о публикации: первое, если до сохранения она
 * опубликованной не была (или её не было вовсе), иначе — правка. Возврат
 * опубликованной в черновик — снятие: её больше никто не видит.
 *
 * Отложенность и срок показа не решаются здесь: они едут в событии, и
 * подписчик сам назначает время. Черновик шине не интересен.
 *
 * Текст — русский: официальный канал один на портал и пишет по-русски.
 */
export function announcementEventsAfterSave(
  before: { status: string } | null,
  after: AnnouncementEventSource,
  actorId: string | null,
): AnnouncementBusEvent[] {
  const wasPublished = before?.status === 'published';
  if (after.status !== 'published') {
    return wasPublished
      ? [
          {
            name: ANNOUNCEMENT_WITHDRAWN,
            payload: { announcementId: after.id },
          },
        ]
      : [];
  }
  return [
    {
      name: ANNOUNCEMENT_PUBLISHED,
      payload: {
        announcementId: after.id,
        firstPublication: !wasPublished,
        title: after.titleRu,
        body: after.bodyRu,
        images: after.images.map(({ url, width, height }) => ({
          url,
          width,
          height,
        })),
        path: ANNOUNCEMENTS_PATH,
        publishAt: after.publishAt?.toISOString() ?? null,
        expiresAt: after.expiresAt?.toISOString() ?? null,
        actorId,
      },
    },
  ];
}
