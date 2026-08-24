import type { PortalActivityAction } from '@vedamatch/shared';

/**
 * Единственное место, где живут тексты карточек ленты друзей. Издатели
 * присылают факт и голое название записи (`entityLabel`), формулировку
 * собирает подписчик — см. контракт сервисного модуля. Тот же приём, что у
 * `notification-copy.ts` в модуле уведомлений, своя копия и здесь.
 *
 * Действия без рода: `User.gender` необязателен, поэтому фраза строится
 * вокруг события («новое объявление», «лайк публикации»), а не спряжённого
 * «опубликовал(а)».
 */
const excerptLength = 80;

function toExcerpt(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= excerptLength) return trimmed;
  return `${trimmed.slice(0, excerptLength - 1)}…`;
}

/**
 * Действия, которые попадают в ленту друзей. Список короче, чем
 * `PORTAL_ACTIVITY_ACTIONS`: чат, объявления-Notices и Астро остаются только
 * в шине баллов (`rewards`) — в первой версии ленты их не показываем.
 */
export const ACTIVITY_FEED_ACTIONS = [
  'motivation.favorite-added',
  'library.entry-created',
  'market.listing-created',
  'market.listing-favorited',
] as const satisfies readonly PortalActivityAction[];

export type ActivityFeedAction = (typeof ACTIVITY_FEED_ACTIONS)[number];

export function isActivityFeedAction(
  action: PortalActivityAction,
): action is ActivityFeedAction {
  return (ACTIVITY_FEED_ACTIONS as readonly string[]).includes(action);
}

export function buildActivityTitle(
  action: ActivityFeedAction,
  entityLabel: string | undefined,
): string {
  switch (action) {
    case 'motivation.favorite-added':
      return 'Лайк публикации во Вдохновении';
    case 'library.entry-created':
      return entityLabel
        ? `Новый материал: «${toExcerpt(entityLabel)}»`
        : 'Новый материал в Образовании';
    case 'market.listing-created':
      return entityLabel
        ? `Новое объявление: «${toExcerpt(entityLabel)}»`
        : 'Новое объявление на Рынке';
    case 'market.listing-favorited':
      return entityLabel
        ? `Лайк лота «${toExcerpt(entityLabel)}»`
        : 'Лайк лота на Рынке';
  }
}
