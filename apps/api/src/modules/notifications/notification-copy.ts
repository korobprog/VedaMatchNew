import type {
  NotificationEvent,
  NotificationEventName,
} from '@vedamatch/shared';

export type NotificationCategory =
  'chat' | 'connections' | 'support' | 'transits';

/** Имена событий литералами: @vedamatch/shared не собирается, и импорт
 *  значения оттуда уронил бы API при старте. Тип сверяет литералы с контрактом. */
export const notificationEventNames = {
  chatMessageSent: 'union.chat.message-sent',
  connectionRequested: 'union.connection.requested',
  connectionAccepted: 'union.connection.accepted',
  supportReplied: 'support.ticket.replied',
  astroTransitDigestReady: 'astro.transit.digest-ready',
} as const satisfies Record<string, NotificationEventName>;

/** Payload веб-пуша ограничен ~4 КБ, да и на экране длинный текст не поместится. */
const excerptLength = 120;

export function toExcerpt(body: string): string {
  const text = body.trim().replace(/\s+/g, ' ');
  if (text.length <= excerptLength) return text;
  return `${text.slice(0, excerptLength - 1)}…`;
}

export interface NotificationContent {
  title: string;
  body: string;
  url: string;
  tag: string;
  category: NotificationCategory;
}

/**
 * Единственное место, где живут тексты уведомлений. Сервисы присылают факты,
 * формулировки собираются здесь — поменять копирайт можно, не трогая Union.
 * Формулировки без рода: User.gender необязателен.
 */
export function buildNotification(
  event: NotificationEvent,
): NotificationContent {
  switch (event.name) {
    case 'union.chat.message-sent':
      return {
        title: event.senderName,
        body: toExcerpt(event.body),
        url: `/union/chats/${event.requestId}`,
        tag: `chat:${event.requestId}`,
        category: 'chat',
      };
    case 'union.connection.requested':
      return {
        title: 'Новая заявка',
        body: `${event.senderName} хочет познакомиться`,
        url: '/union/connections',
        tag: 'connections',
        category: 'connections',
      };
    case 'union.connection.accepted':
      return {
        title: 'Заявка принята',
        body: `Теперь вы можете общаться с ${event.senderName}`,
        url: `/union/chats/${event.requestId}`,
        tag: 'connections',
        category: 'connections',
      };
    case 'support.ticket.replied':
      return {
        title: 'Ответ поддержки',
        body: 'Поддержка ответила на ваше обращение',
        url: `/support/${event.ticketId}`,
        tag: `support:${event.ticketId}`,
        category: 'support',
      };
    case 'astro.transit.digest-ready':
      return {
        title: 'Персональный день',
        body: toExcerpt(event.excerpt),
        url: '/astro/chart',
        // Один тег на пользователя в сутки: повторный расчёт того же дня
        // заменяет прежнее уведомление, а не плодит второе.
        tag: 'astro-transit',
        category: 'transits',
      };
  }
}
