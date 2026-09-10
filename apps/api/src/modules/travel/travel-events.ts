import type { NotificationEvent } from '@vedamatch/shared';

/**
 * События «Путешествий» для шины портала.
 *
 * Имена литералами, а не импортом значения: тот же приём, что в
 * `work-events.ts`. Тип сверяет литералы с контрактом уведомлений.
 *
 * Payload самодостаточен: подписчик («Уведомления», агенда «Работы») не имеет
 * права дочитывать недостающее из наших таблиц, поэтому в событии едут и
 * название объекта, и имя гостя, и даты. Формулировку собирает подписчик — мы
 * сообщаем факт.
 */
export const TRAVEL_EVENTS = {
  bookingCreated: 'travel.booking.created',
  bookingStatusChanged: 'travel.booking.status-changed',
} as const satisfies Record<string, NotificationEvent['name']>;

type TravelEvent<TName extends NotificationEvent['name']> = Extract<
  NotificationEvent,
  { name: TName }
>;

export type TravelBookingCreatedEvent = TravelEvent<'travel.booking.created'>;
export type TravelBookingStatusChangedEvent =
  TravelEvent<'travel.booking.status-changed'>;

/**
 * Факт смены статуса для зеркал в других сервисах — не уведомление.
 *
 * Отдельно от `travel.booking.status-changed`, потому что у них разные
 * адресаты и разные условия. Уведомление адресовано гостю и не уходит вовсе,
 * когда гость не человек портала: заявку могли завести с публичной страницы.
 * А карточка в «Моём дне» управляющего обязана поменяться в любом случае —
 * иначе заявка гостя без аккаунта навсегда осталась бы там «новой».
 *
 * Получателя у события нет: это сообщение о факте, а не письмо человеку.
 */
export const TRAVEL_BOOKING_DECIDED_EVENT = 'travel.booking.decided';

export interface TravelBookingDecidedEvent {
  bookingId: string;
  status: string;
}

/**
 * Статусы, о которых гостю есть что сказать.
 *
 * `cancelled` сюда не входит: отменяет заявку сам гость, и уведомление о
 * собственном действии — самый быстрый способ научить человека не читать
 * колокольчик (то же правило, что в `workTaskRecipients`).
 */
export const GUEST_NOTIFIED_STATUSES = [
  'accepted',
  'declined',
  'checked_in',
  'completed',
] as const;

export type GuestNotifiedStatus = (typeof GUEST_NOTIFIED_STATUSES)[number];

export function notifiesGuest(status: string): status is GuestNotifiedStatus {
  return (GUEST_NOTIFIED_STATUSES as readonly string[]).includes(status);
}

/**
 * Кому уходит новость о заявке: управляющим объектом, кроме того, кто её сам
 * и завёл. Управляющий, забронировавший себе комнату, получать пуш о своём
 * действии не должен.
 */
export function bookingRecipients(
  managerIds: readonly string[],
  actorId: string | null,
): string[] {
  return [...new Set(managerIds)].filter((id) => id !== actorId);
}
