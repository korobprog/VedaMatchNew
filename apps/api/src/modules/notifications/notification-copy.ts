import type { NotificationEvent } from '@vedamatch/shared';

export type NotificationCategory = 'chat' | 'connections' | 'support';

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
        body: event.excerpt,
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
  }
}
