/** Событие для уведомлений. Несёт факты, а не формулировки: тексты живут
 *  в apps/api/src/modules/notifications/notification-copy.ts. */
export type NotificationEvent =
  | {
      name: 'union.chat.message-sent';
      recipientId: string;
      senderName: string;
      /** Полный текст: обрезает его модуль уведомлений, а не издатель. */
      body: string;
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
  | { name: 'support.ticket.replied'; recipientId: string; ticketId: string }
  | {
      name: 'astro.transit.digest-ready';
      recipientId: string;
      /** Готовая фраза дня — самодостаточна, подписчик её не переписывает. */
      excerpt: string;
    };

/**
 * Пакет не собирается (`main: src/index.ts`), поэтому API импортирует отсюда
 * ТОЛЬКО типы: они стираются при компиляции. Значение, вывезенное сюда,
 * заставит Node грузить сырой TypeScript и уронит сервис при старте.
 * Имена событий поэтому — строковые литералы, проверяемые типом выше.
 */
export type NotificationEventName = NotificationEvent['name'];

export interface NotificationPreferencesDto {
  enabled: boolean;
  chat: boolean;
  connections: boolean;
  support: boolean;
  /** Ежедневный персональный день по транзитам (сервис astro). */
  transits: boolean;
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
