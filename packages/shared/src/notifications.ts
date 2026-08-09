/** Событие для уведомлений. Несёт факты, а не формулировки: тексты живут
 *  в apps/api/src/modules/notifications/notification-copy.ts. */
export type NotificationEvent =
  | {
      name: 'union.chat.message-sent';
      recipientId: string;
      senderName: string;
      excerpt: string;
      requestId: string;
    }
  | {
      name: 'union.connection.requested';
      recipientId: string;
      senderName: string;
    }
  | {
      name: 'union.connection.accepted';
      recipientId: string;
      senderName: string;
      requestId: string;
    }
  | { name: 'support.ticket.replied'; recipientId: string; ticketId: string };

export const notificationEventNames = {
  chatMessageSent: 'union.chat.message-sent',
  connectionRequested: 'union.connection.requested',
  connectionAccepted: 'union.connection.accepted',
  supportReplied: 'support.ticket.replied',
} as const;

/** Payload веб-пуша ограничен ~4 КБ, да и на экране длинный текст не поместится. */
export const notificationExcerptLength = 120;

export function toNotificationExcerpt(body: string): string {
  const text = body.trim().replace(/\s+/g, ' ');
  if (text.length <= notificationExcerptLength) return text;
  return `${text.slice(0, notificationExcerptLength - 1)}…`;
}

export interface NotificationPreferencesDto {
  enabled: boolean;
  chat: boolean;
  connections: boolean;
  support: boolean;
}

export type UpdateNotificationPreferencesRequest =
  Partial<NotificationPreferencesDto>;

export interface PushSubscriptionRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeyResponse {
  publicKey: string;
}
