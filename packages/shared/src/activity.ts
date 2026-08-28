// Факт осмысленного действия человека в сервисе. Портальный тип, а не
// сервисный: издателей много (chat, notices, market, astro, motivation),
// подписчик — любой, кому важно, что человек чем-то воспользовался.
//
// Отличие от NotificationEvent принципиальное: там `recipientId` — кого
// оповестить, здесь `userId` — кто сделал. Уведомительные события для
// начисления баллов не годятся именно поэтому.

import type { SpiritualStage } from './index';

/**
 * Что человек сделал. Значение, а не только тип: админка показывает
 * действие в карточке реферала, и второй такой же список в вебе означал бы
 * расхождение подписей.
 */
export const PORTAL_ACTIVITY_ACTIONS = [
  'chat.message-sent',
  'notices.notice-created',
  'market.listing-created',
  'market.listing-favorited',
  'astro.birth-data-saved',
  'motivation.favorite-added',
  'library.entry-created',
  'music.track-favorited',
  'music.playlist-published',
] as const;

export type PortalActivityAction = (typeof PORTAL_ACTIVITY_ACTIONS)[number];

/**
 * Имена событий шины. Издатель шлёт `<service>.user.activity`, подписчик
 * слушает все имена поимённо: общего wildcard в EventEmitterModule здесь не
 * включено, а включать его ради одного подписчика — менять поведение всей шины.
 *
 * Имя — строковый литерал в объекте, а не enum: пакет отдаёт наружу типы,
 * и значение отсюда обязано пережить импорт из скомпилированного JS.
 */
export const PORTAL_ACTIVITY_EVENTS = {
  chat: 'chat.user.activity',
  notices: 'notices.user.activity',
  market: 'market.user.activity',
  astro: 'astro.user.activity',
  motivation: 'motivation.user.activity',
  library: 'library.user.activity',
  music: 'music.user.activity',
} as const;

export type PortalActivityEventName =
  (typeof PORTAL_ACTIVITY_EVENTS)[keyof typeof PORTAL_ACTIVITY_EVENTS];

/**
 * Самодостаточный факт: подписчик не имеет права дочитывать недостающее из
 * таблиц сервиса-издателя, поэтому здесь есть всё — кто, что и когда.
 *
 * `entityId`/`entityLabel`/`link` необязательны и добавлены позже: старый
 * единственный подписчик (`RewardsListener`) их не читает, начисление баллов
 * идёт по одному `action`, так что расширение поля ничего не ломает.
 */
export interface PortalActivityEvent {
  name: PortalActivityEventName;
  userId: string;
  action: PortalActivityAction;
  /** ISO-время действия. Строка, а не Date: событие переживает сериализацию. */
  occurredAt: string;
  /** Id записи (поста, лота), к которой ведёт `link`. */
  entityId?: string;
  /** Название/заголовок записи — то, что подставляется в текст карточки ленты. */
  entityLabel?: string;
  /** Относительный путь на запись. */
  link?: string;
}

// ===== Лента друзей: кто кому открыл видимость активности =====

export type ActivityAccessSource = 'union' | 'contacts';

/**
 * Имена событий выдачи/отзыва доступа. Издатели — Union (мэтч, обе стороны
 * сразу) и Общение/Справочник (раскрытие контактов, одна сторона). Модулю
 * `activity` эти события заменяют чтение чужих таблиц, запрещённое контрактом.
 */
export const PORTAL_ACCESS_EVENTS = {
  union: 'union.user.access',
  contacts: 'contacts.user.access',
} as const;

export type PortalAccessEventName =
  (typeof PORTAL_ACCESS_EVENTS)[keyof typeof PORTAL_ACCESS_EVENTS];

/** Самодостаточный факт: кто кому открыл (или закрыл) видимость активности. */
export interface PortalAccessEvent {
  name: PortalAccessEventName;
  /** Тот, чья активность становится видна. */
  granterId: string;
  /** Тот, кому она видна. */
  granteeId: string;
  source: ActivityAccessSource;
  /** `false` — доступ отозван (пока актуально только для Справочника). */
  granted: boolean;
  occurredAt: string;
}

// ===== Лента друзей: чтение (REST) =====

/** Одна карточка в полосе действий друга. Текст уже собран на сервере. */
export interface ActivityFeedItem {
  id: string;
  action: PortalActivityAction;
  /** Готовый текст, например «опубликовала во Вдохновении». */
  title: string;
  link: string | null;
  occurredAt: string;
}

export interface ActivityFriendSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  spiritualStage: SpiritualStage | null;
  /** Администратор портала — редкий значок на аватаре, не путать со ступенью. */
  isAdmin: boolean;
  /** Откуда открыт доступ именно этому зрителю — мэтч или раскрытые контакты. */
  source: ActivityAccessSource;
  /** Заходил(а) не дальше 15 минут назад. */
  isOnline: boolean;
}

/** Строка ленты: один друг и его последние действия, самое новое первым. */
export interface ActivityFriendRow {
  friend: ActivityFriendSummary;
  items: ActivityFeedItem[];
  lastActivityAt: string;
}

export interface ActivityFeedResponse {
  friends: ActivityFriendRow[];
}

export interface ActivityFriendFeedResponse {
  friend: ActivityFriendSummary;
  items: ActivityFeedItem[];
}

/** Живое событие SSE: карточка плюс автор, чтобы клиент знал, в чью строку её вставить. */
export interface ActivityStreamEvent {
  friend: ActivityFriendSummary;
  item: ActivityFeedItem;
}

/** Имя события регистрации. Издатель — `auth`, и он один. */
export const USER_REGISTERED_EVENT = 'auth.user.registered';

/**
 * Регистрация нового аккаунта. Несёт всё, что нужно антифроду реферальной
 * программы: адрес, отпечаток устройства и IP. Модуль `auth` о баллах не
 * знает — он сообщает факт, а не начисление.
 */
export interface UserRegisteredEvent {
  name: typeof USER_REGISTERED_EVENT;
  userId: string;
  email: string;
  /** Код из реферальной ссылки, если человек пришёл по ней. */
  referralCode: string | null;
  /** Откуда перешёл: `landing`, `telegram`, `whatsapp`; `null` — неизвестно. */
  referralSource: string | null;
  ip: string | null;
  /** Отпечаток устройства из cookie `vm_fp`; `null` — cookie не доехала. */
  deviceId: string | null;
  occurredAt: string;
}
