import { countNights } from './travel-dates';

/**
 * Кому писать по объекту. Владелец — тот, кто отвечает за место; если его
 * почему-то нет, первый управляющий. Управляющему самому себе писать незачем:
 * тогда null, и сервис ответит понятной ошибкой.
 */
export function pickStayRecipient(
  managers: readonly { userId: string; role: 'owner' | 'manager' }[],
  requesterId: string,
): string | null {
  if (managers.some((manager) => manager.userId === requesterId)) return null;
  const owner = managers.find((manager) => manager.role === 'owner');
  return owner?.userId ?? managers[0]?.userId ?? null;
}

const shortDate = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Строка о заявке на карточке в переписке: хозяин сразу видит, о каких
 * датах речь, и не переспрашивает. Без заявки — вопрос о месте вообще.
 */
export function contactCardBody(
  booking: { number: number; checkIn: Date; checkOut: Date } | null,
): string {
  if (!booking) return 'Вопрос о размещении';
  const nights = countNights(booking.checkIn, booking.checkOut);
  return `Заявка №${booking.number} · ${shortDate.format(booking.checkIn)} — ${shortDate.format(booking.checkOut)}, ночей: ${nights}`;
}

/** Первое сообщение, если человек ничего не написал сам. */
export const DEFAULT_CONTACT_MESSAGE =
  'Здравствуйте! Хочу уточнить по размещению.';

export const MAX_CONTACT_MESSAGE = 1000;

/** Текст сообщения из запроса: пустой — вежливая заготовка. */
export function contactMessage(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return DEFAULT_CONTACT_MESSAGE;
  return text.slice(0, MAX_CONTACT_MESSAGE);
}
