import {
  TRAVEL_GUEST_COLORS,
  TRAVEL_MAX_PAID_NIGHTS,
  type TravelGuestColor,
} from '@vedamatch/shared';
import { CashInputError } from './cash-input';
import { countNights, parseStayDate, TravelDateError } from './travel-dates';

export const MAX_GUEST_NAME = 120;
export const MAX_GUEST_PHONE = 40;
export const MAX_GUEST_KEY = 40;
export const MAX_GUEST_INFO = 2000;

export interface GuestInput {
  fullName: string;
  phone: string;
  keyLabel: string;
  roomId: string | null;
  personalInfo: string;
  color: TravelGuestColor;
  checkInOn: Date;
  leftOn: Date | null;
}

function text(value: unknown, max: number, field: string): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (result.length > max) {
    throw new CashInputError(`Поле «${field}» длиннее ${max} знаков`);
  }
  return result;
}

function day(value: unknown, field: string): Date {
  try {
    return parseStayDate(value, field);
  } catch (error) {
    if (error instanceof TravelDateError)
      throw new CashInputError(error.message);
    throw error;
  }
}

/** Карточка гостя. Ошибки — `CashInputError`: сервис отвечает на них 400. */
export function parseGuestInput(body: Record<string, unknown>): GuestInput {
  const fullName = text(body.fullName, MAX_GUEST_NAME, 'ФИО');
  if (!fullName) throw new CashInputError('Укажите, как зовут гостя');

  const color = body.color ?? 'none';
  if (
    typeof color !== 'string' ||
    !(TRAVEL_GUEST_COLORS as readonly string[]).includes(color)
  ) {
    throw new CashInputError('Выберите цвет из списка');
  }

  const checkInOn = day(body.checkInOn, 'заезд');
  const leftOn =
    body.leftOn === undefined || body.leftOn === null || body.leftOn === ''
      ? null
      : day(body.leftOn, 'выезд');
  if (leftOn && countNights(checkInOn, leftOn) < 0) {
    throw new CashInputError('Выезд не может быть раньше заезда');
  }

  return {
    fullName,
    phone: text(body.phone, MAX_GUEST_PHONE, 'телефон'),
    keyLabel: text(body.keyLabel, MAX_GUEST_KEY, 'ключ'),
    roomId:
      typeof body.roomId === 'string' && body.roomId.trim()
        ? body.roomId.trim()
        : null,
    personalInfo: text(body.personalInfo, MAX_GUEST_INFO, 'личная информация'),
    color: color as TravelGuestColor,
    checkInOn,
    leftOn,
  };
}

/**
 * Гость и оплаченные сутки у записи кассы. Сутки имеют смысл только у дохода
 * от конкретного гостя: иначе «оплачено по» не к кому привязать.
 */
export function parseEntryGuest(
  body: Record<string, unknown>,
  kind: 'income' | 'expense',
): { guestId: string | null; nights: number | null } {
  const guestId =
    typeof body.guestId === 'string' && body.guestId.trim()
      ? body.guestId.trim()
      : null;
  const rawNights = body.nights;
  if (rawNights === undefined || rawNights === null || rawNights === '') {
    return { guestId, nights: null };
  }
  if (
    typeof rawNights !== 'number' ||
    !Number.isInteger(rawNights) ||
    rawNights < 1 ||
    rawNights > TRAVEL_MAX_PAID_NIGHTS
  ) {
    throw new CashInputError(
      `Оплаченных суток — целое число от 1 до ${TRAVEL_MAX_PAID_NIGHTS}`,
    );
  }
  if (kind !== 'income' || !guestId) {
    throw new CashInputError('Сутки оплачивает гость — выберите его в доходе');
  }
  return { guestId, nights: rawNights };
}
