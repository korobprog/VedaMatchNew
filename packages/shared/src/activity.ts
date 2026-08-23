// Факт осмысленного действия человека в сервисе. Портальный тип, а не
// сервисный: издателей много (chat, notices, market, astro, motivation),
// подписчик — любой, кому важно, что человек чем-то воспользовался.
//
// Отличие от NotificationEvent принципиальное: там `recipientId` — кого
// оповестить, здесь `userId` — кто сделал. Уведомительные события для
// начисления баллов не годятся именно поэтому.

/**
 * Что человек сделал. Значение, а не только тип: админка показывает
 * действие в карточке реферала, и второй такой же список в вебе означал бы
 * расхождение подписей.
 */
export const PORTAL_ACTIVITY_ACTIONS = [
  'chat.message-sent',
  'notices.notice-created',
  'market.listing-created',
  'astro.birth-data-saved',
  'motivation.favorite-added',
] as const;

export type PortalActivityAction = (typeof PORTAL_ACTIVITY_ACTIONS)[number];

/**
 * Имена событий шины. Издатель шлёт `<service>.user.activity`, подписчик
 * слушает все пять: общего wildcard в EventEmitterModule здесь не включено,
 * а включать его ради одного подписчика — менять поведение всей шины.
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
} as const;

export type PortalActivityEventName =
  (typeof PORTAL_ACTIVITY_EVENTS)[keyof typeof PORTAL_ACTIVITY_EVENTS];

/**
 * Самодостаточный факт: подписчик не имеет права дочитывать недостающее из
 * таблиц сервиса-издателя, поэтому здесь есть всё — кто, что и когда.
 */
export interface PortalActivityEvent {
  name: PortalActivityEventName;
  userId: string;
  action: PortalActivityAction;
  /** ISO-время действия. Строка, а не Date: событие переживает сериализацию. */
  occurredAt: string;
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
