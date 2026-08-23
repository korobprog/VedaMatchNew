import type { Role, SpiritualStage } from './index';

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
      /**
       * Тот, с кем теперь можно переписываться. Раньше событие несло id
       * заявки, и ссылка вела в `/union/chats/<id>`; после переезда переписки
       * такой адрес совпадает с беседой только у диалогов, перенесённых
       * миграцией, а у новой пары ведёт в никуда.
       */
      companionId: string;
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
    }
  | {
      /** Новость от администрации портала: рассылает админ вручную. */
      name: 'portal.announcement.published';
      recipientId: string;
      announcementId: string;
      title: string;
      excerpt: string;
    }
  | {
      name: 'motivation.reel.published';
      recipientId: string;
      reelId: string;
      /** Slug опубликованного поста: ведём сразу на него. */
      slug: string;
    }
  | {
      name: 'motivation.reel.rejected';
      recipientId: string;
      reelId: string;
      /** Причина простым языком — её же видит автор в мастере. */
      reason: string;
    }
  | {
      /** Ролик принят администратором и стал виден автору. */
      name: 'motivation.video.ready';
      recipientId: string;
      reelId: string;
    }
  | {
      /**
       * Ролик собран и ждёт приёмки. Уходит администраторам: до приёмки он
       * виден только в очереди, и без сигнала о нём никто не узнает.
       */
      name: 'motivation.video.review';
      recipientId: string;
      reelId: string;
    }
  | {
      /**
       * Решение по заявке на раздел справочника. Без него человек не узнает
       * ни об отказе, ни о том, что раздел уже можно использовать.
       */
      name: 'library.section-request.decided';
      recipientId: string;
      requestId: string;
      titleRu: string;
      approved: boolean;
      /** Слаг созданного раздела — ведём сразу в него. Пусто при отказе. */
      sectionSlug?: string;
      /** Комментарий администратора; при отказе это причина. */
      comment?: string;
    }
  | {
      /** Сообщение в сервисе «Общение»: личный диалог, группа или канал. */
      name: 'chat.message-sent';
      recipientId: string;
      senderName: string;
      /** Название группы или канала; у личного диалога пусто. */
      conversationTitle?: string;
      body: string;
      conversationId: string;
    }
  | {
      /** Первое сообщение от незнакомого человека — лежит в запросах. */
      name: 'chat.request-received';
      recipientId: string;
      senderName: string;
      body: string;
      conversationId: string;
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
  | 'announcements'
  | 'notices'
  | 'chat'
  | 'connections'
  | 'support'
  | 'transits'
  | 'market'
  | 'motivation'
  | 'announcements';

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
  /**
   * Когда прочитано; null — ещё нет. Прочитанное остаётся в списке неделю:
   * раньше открытие страницы гасило всё разом, и уведомления, до которых
   * человек не успел дойти, исчезали у него на глазах.
   */
  readAt: string | null;
}

export interface NotificationInboxResponse {
  /** Непрочитанные и, следом, прочитанные за последнюю неделю. */
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
  /** Судьба своих рилсов в «Мотивации»: опубликован или отклонён. */
  motivation: boolean;
  /** Новости от администрации портала. Под этой же категорией идут рассылки
   *  из админки: выключение гасит пуш, а важная рассылка всё равно появится
   *  в колокольчике — см. `important` у рассылки. */
  announcements: boolean;
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

// ===== Рассылки администрации =====

/**
 * Кому уйдёт рассылка. Пустое поле — «неважно»; заблокированные и удалённые
 * аккаунты не попадают в выборку никогда, это не настраивается.
 */
export interface NotificationAudienceFilter {
  /** Этапы. Пусто — все, включая аккаунты без этапа. */
  stages?: SpiritualStage[];
  /** Роли. Пусто — все. */
  roles?: Role[];
  /** `paid` — активный платный доступ на сейчас, `unpaid` — его нет. */
  payment?: 'paid' | 'unpaid';
  /** Только те, у кого есть хотя бы одна подписка на веб-пуш. */
  withPushOnly?: boolean;
}

export type NotificationBroadcastStatus =
  | 'draft'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled';

export interface NotificationBroadcastDto {
  id: string;
  title: string;
  body: string;
  url: string | null;
  important: boolean;
  audience: NotificationAudienceFilter;
  status: NotificationBroadcastStatus;
  totalRecipients: number;
  deliveredCount: number;
  pushSentCount: number;
  errorMessage: string | null;
  /** Мирское имя автора: это админский экран. `null` — аккаунт удалён. */
  createdByName: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CreateNotificationBroadcastRequest {
  title: string;
  body: string;
  url?: string | null;
  important?: boolean;
  audience?: NotificationAudienceFilter;
}

export type UpdateNotificationBroadcastRequest =
  Partial<CreateNotificationBroadcastRequest>;

/** Сколько человек попадёт под фильтр — до того, как рассылку запустили. */
export interface NotificationAudiencePreviewResponse {
  /** Всего подходящих активных аккаунтов. */
  total: number;
  /** Из них получат пуш: категория включена и есть подписка на устройство. */
  withPush: number;
  /** Из них выключили категорию «объявления администрации». */
  optedOut: number;
}

export const BROADCAST_TITLE_MAX_LENGTH = 120;
export const BROADCAST_BODY_MAX_LENGTH = 1000;
