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
  | {
      name: 'contacts.request.received';
      recipientId: string;
      senderName: string;
    }
  | {
      name: 'contacts.request.accepted';
      recipientId: string;
      /** Имя того, кто открыл контакты. */
      senderName: string;
      /** Карточка, на которой теперь видны способы связи. */
      ownerUserId: string;
    }
  | { name: 'support.ticket.replied'; recipientId: string; ticketId: string }
  | {
      name: 'astro.transit.digest-ready';
      recipientId: string;
      /** Готовая фраза дня — самодостаточна, подписчик её не переписывает. */
      excerpt: string;
    }
  | {
      name: 'market.chat.message-sent';
      recipientId: string;
      senderName: string;
      /** Полный текст: обрезает его модуль уведомлений, а не издатель. */
      body: string;
      conversationId: string;
    }
  | {
      name: 'market.order.created';
      recipientId: string;
      buyerName: string;
      orderId: string;
      /** Человекочитаемый номер: «заявка №42» понятнее, чем uuid. */
      orderNumber: number;
      itemsCount: number;
    }
  | {
      name: 'market.order.status-changed';
      recipientId: string;
      shopName: string;
      orderId: string;
      orderNumber: number;
      /** Строковый литерал, а не импорт из market.ts: notifications.ts —
       *  портальная инфраструктура и не должна зависеть от сервиса. */
      status:
        | 'new_request'
        | 'accepted'
        | 'in_progress'
        | 'completed'
        | 'declined_by_seller'
        | 'cancelled_by_buyer';
    }
  | {
      name: 'market.listing.published';
      recipientId: string;
      /** На что человек подписан: магазин, раздел или категория. */
      sourceName: string;
      listingTitle: string;
      listingId: string;
    }
  | {
      name: 'notices.notice.published';
      recipientId: string;
      /** На что человек подписан: рубрика, город или община. */
      sourceName: string;
      noticeTitle: string;
      noticeId: string;
    }
  | {
      name: 'notices.response.received';
      recipientId: string;
      /** Имя откликнувшегося — уже через resolveDisplayName. */
      senderName: string;
      noticeTitle: string;
      noticeId: string;
    }
  | {
      name: 'notices.response.accepted';
      recipientId: string;
      noticeTitle: string;
      noticeId: string;
    }
  | {
      name: 'market.listing.price-dropped';
      recipientId: string;
      listingTitle: string;
      listingId: string;
      /** Минорные единицы: форматирование — забота слоя копирайта. */
      priceMinor: number;
      previousPriceMinor: number;
      currency: 'rub' | 'usd' | 'eur' | 'inr';
    }
  | {
      name: 'market.review.received';
      recipientId: string;
      authorName: string;
      rating: number;
      shopSlug: string;
    };

/**
 * Пакет не собирается (`main: src/index.ts`), поэтому API импортирует отсюда
 * ТОЛЬКО типы: они стираются при компиляции. Значение, вывезенное сюда,
 * заставит Node грузить сырой TypeScript и уронит сервис при старте.
 * Имена событий поэтому — строковые литералы, проверяемые типом выше.
 */
export type NotificationEventName = NotificationEvent['name'];

/** Категории совпадают с тумблерами в NotificationPreferencesDto. */
export type NotificationCategory =
  | 'notices'
  | 'chat'
  | 'connections'
  | 'support'
  | 'transits'
  | 'market';

/** Уведомление в колокольчике. Живёт до прочтения, потом удаляется — это
 *  список непрочитанного, а не архив. */
export interface NotificationItemDto {
  id: string;
  title: string;
  body: string;
  /** Куда вести по клику. */
  url: string;
  category: NotificationCategory;
  /** ISO-строка. */
  createdAt: string;
}

export interface NotificationInboxResponse {
  items: NotificationItemDto[];
  unreadCount: number;
}

export interface NotificationUnreadCountResponse {
  unreadCount: number;
}

export interface NotificationPreferencesDto {
  enabled: boolean;
  chat: boolean;
  connections: boolean;
  support: boolean;
  /** Ежедневный персональный день по транзитам (сервис astro). */
  transits: boolean;
  /** Заявки и их статусы на Рынке. Сообщения в чате Рынка сюда не входят —
   *  они идут под общим тумблером `chat`: второй переключатель на то же
   *  самое только путал бы. */
  market: boolean;
  /** Доска «Объявления»: подписки на рубрику и город, отклики на свои
   *  объявления. Отдельно от `market`: выключив коммерцию, человек не должен
   *  молча потерять доску общины. */
  notices: boolean;
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
