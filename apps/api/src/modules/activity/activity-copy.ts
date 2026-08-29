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
 * `PORTAL_ACTIVITY_ACTIONS`, и граница проходит по публичности результата:
 * лента показывает то, что человек и так выложил на общий обзор.
 *
 * Чат и Астро сюда не попадут никогда — переписка и дата рождения приватны,
 * и «написал сообщение» в чужой ленте это утечка поведения, а не новость.
 * Они остаются только в шине баллов (`rewards`).
 */
export const ACTIVITY_FEED_ACTIONS = [
  'motivation.favorite-added',
  'library.entry-created',
  'market.listing-created',
  'market.listing-favorited',
  'notices.notice-created',
  'music.track-favorited',
  'music.playlist-published',
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
    // Не «новое объявление»: этими словами уже подписан лот Рынка, и две
    // одинаковые карточки из разных сервисов в одной полосе не различить.
    // Разводим по месту, а не по слову.
    case 'notices.notice-created':
      return entityLabel
        ? `Новое на доске: «${toExcerpt(entityLabel)}»`
        : 'Новая запись на доске объявлений';
    // Не «лайк»: этим словом уже подписаны Вдохновение и Рынок, и третье
    // одинаковое начало в одной бегущей полосе не различить.
    case 'music.track-favorited':
      return entityLabel
        ? `В избранное: «${toExcerpt(entityLabel)}»`
        : 'Новая запись в избранном Музыки';
    case 'music.playlist-published':
      return entityLabel
        ? `Плейлист «${toExcerpt(entityLabel)}»`
        : 'Новый плейлист в Музыке';
  }
}
