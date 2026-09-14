import { countNights } from './travel-dates';

/**
 * Оплаченный срок гостя. Ничего не хранится: срок выводится из дня заезда и
 * суммы оплаченных суток по записям кассы, поэтому правка или удаление оплаты
 * задним числом пересчитывает его сам, без миграций данных.
 *
 * Сутки считаются ночами: заезд 18 мая и две оплаченные ночи — это ночи на 18
 * и на 19 мая, «оплачено по 19 мая включительно», 20-го утром либо выезд,
 * либо новая оплата.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function utcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Последний оплаченный день включительно; null — оплат не было. */
export function paidThrough(checkInOn: Date, paidNights: number): Date | null {
  return paidNights > 0 ? addDays(checkInOn, paidNights - 1) : null;
}

/**
 * Сколько прожитых ночей не оплачено.
 *
 * Живущему засчитывается и ночь на сегодня: деньги за неё берут днём, а не
 * утром после. Выехавшему — ночи до дня выезда. Заезд в будущем долга не
 * даёт: бронь ещё не проживание.
 */
export function unpaidNights(
  checkInOn: Date,
  leftOn: Date | null,
  paidNights: number,
  today: Date,
): number {
  const end = leftOn ?? addDays(utcDay(today), 1);
  const stayed = Math.max(0, countNights(checkInOn, end));
  return Math.max(0, stayed - paidNights);
}

export interface SortableGuest {
  fullName: string;
  leftOn: Date | null;
}

/**
 * Порядок клиентской базы: сначала те, кто живёт сейчас, по имени — их ищут
 * глазами на ресепшене; потом выехавшие, свежие сверху.
 */
export function compareGuests(a: SortableGuest, b: SortableGuest): number {
  if (!a.leftOn !== !b.leftOn) return a.leftOn ? 1 : -1;
  if (a.leftOn && b.leftOn && a.leftOn.getTime() !== b.leftOn.getTime()) {
    return b.leftOn.getTime() - a.leftOn.getTime();
  }
  return a.fullName.localeCompare(b.fullName, 'ru');
}
