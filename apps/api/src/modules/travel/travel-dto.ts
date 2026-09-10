import {
  TRAVEL_CURRENCIES,
  TRAVEL_STAY_KINDS,
  TRAVEL_STAY_PAYMENTS,
  type TravelCurrency,
  type TravelStayKind,
  type TravelStayPayment,
} from '@vedamatch/shared';
import { parseStayRange, type StayRange } from './travel-dates';

export class TravelInputError extends Error {}

const MAX_NAME = 120;
const MAX_TEXT = 4000;
const MAX_ADDRESS = 300;
const MAX_COMMENT = 1000;
const MAX_GUESTS = 20;

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new TravelInputError(`Поле «${field}» обязательно`);
  }
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) throw new TravelInputError(`Поле «${field}» обязательно`);
  if (text.length > max) {
    throw new TravelInputError(`Поле «${field}» длиннее ${max} знаков`);
  }
  return text;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new TravelInputError(`Поле «${field}» должно быть текстом`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new TravelInputError(`Поле «${field}» длиннее ${max} знаков`);
  }
  return text;
}

/**
 * Телефон. Хранится как написали — с плюсом, скобками и пробелами: по нему
 * звонит человек, а не программа, и «нормализованный» индийский номер без
 * плюса из России не набирается. Проверяем только, что цифр достаточно.
 */
export function parsePhone(value: unknown): string {
  const raw = requiredString(value, 'телефон', 40);
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new TravelInputError('Телефон не похож на телефон');
  }
  return raw;
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (
    typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
  ) {
    return value as T;
  }
  throw new TravelInputError(`Неизвестное значение поля «${field}»`);
}

/**
 * Цена за ночь в минорных единицах — целым числом, как на Рынке. Дроби не
 * принимаем: копейка, потерянная на округлении при каждом умножении на ночи,
 * к концу месяца становится расхождением в счёте.
 */
export function parsePriceMinor(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TravelInputError('Цена должна быть целым числом в копейках');
  }
  if (value > 100_000_000) {
    throw new TravelInputError('Цена слишком велика — проверьте копейки');
  }
  return value;
}

export interface ParsedBookingInput extends StayRange {
  stayId: string;
  roomId: string | null;
  guestName: string;
  guestPhone: string;
  guests: number;
  comment: string | null;
}

/**
 * Заявка на ночлег. `today` передаётся снаружи — по той же причине, что и в
 * parseStayRange: иначе тест на «заезд сегодня» зависел бы от часа запуска.
 */
export function parseBookingInput(
  body: Record<string, unknown>,
  today: Date,
): ParsedBookingInput {
  const stayId = requiredString(body.stayId, 'объект', 64);
  const roomId =
    typeof body.roomId === 'string' && body.roomId.trim()
      ? body.roomId.trim()
      : null;
  const guestName = requiredString(body.guestName, 'имя', MAX_NAME);
  const guestPhone = parsePhone(body.guestPhone);
  const range = parseStayRange(body.checkIn, body.checkOut, today);

  const guests = body.guests ?? 1;
  if (
    typeof guests !== 'number' ||
    !Number.isInteger(guests) ||
    guests < 1 ||
    guests > MAX_GUESTS
  ) {
    throw new TravelInputError(`Гостей должно быть от 1 до ${MAX_GUESTS}`);
  }

  const comment = optionalText(body.comment, 'пожелания', MAX_COMMENT);

  return {
    ...range,
    stayId,
    roomId,
    guestName,
    guestPhone,
    guests,
    comment: comment || null,
  };
}

export interface ParsedStayInput {
  kind: TravelStayKind;
  name: string;
  placeId: string | null;
  description: string;
  address: string;
  lat: number | null;
  lng: number | null;
  payment: TravelStayPayment;
  priceMinor: number | null;
  currency: TravelCurrency;
  sevaNote: string | null;
  contactPhone: string | null;
}

/** Координата: широта от -90 до 90, долгота от -180 до 180, либо ничего. */
function parseCoordinate(
  value: unknown,
  field: string,
  limit: number,
): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TravelInputError(`Координата «${field}» должна быть числом`);
  }
  if (value < -limit || value > limit) {
    throw new TravelInputError(`Координата «${field}» вне допустимых значений`);
  }
  return value;
}

export function parseStayInput(body: Record<string, unknown>): ParsedStayInput {
  const kind = parseEnum(body.kind, TRAVEL_STAY_KINDS, 'вид');
  const payment = parseEnum(body.payment, TRAVEL_STAY_PAYMENTS, 'оплата');
  const currency =
    body.currency === undefined
      ? ('rub' as TravelCurrency)
      : parseEnum(body.currency, TRAVEL_CURRENCIES, 'валюта');
  const priceMinor = parsePriceMinor(body.priceMinor);

  // Объект «за плату» без цены — это карточка, по которой нельзя понять,
  // сколько стоит ночь. За служение цены нет по определению, и требовать её
  // там значило бы заставлять хозяина писать ноль.
  if (payment === 'paid' && priceMinor === null) {
    throw new TravelInputError('У объекта за плату должна быть цена за ночь');
  }

  const sevaNote = optionalText(body.sevaNote, 'служение', MAX_TEXT);
  if (payment === 'seva' && !sevaNote) {
    throw new TravelInputError(
      'Напишите, какое служение ждёте от гостя — иначе он не поймёт, о чём договаривается',
    );
  }

  return {
    kind,
    name: requiredString(body.name, 'название', MAX_NAME),
    placeId:
      typeof body.placeId === 'string' && body.placeId.trim()
        ? body.placeId.trim()
        : null,
    description: optionalText(body.description, 'описание', MAX_TEXT),
    address: optionalText(body.address, 'адрес', MAX_ADDRESS),
    lat: parseCoordinate(body.lat, 'широта', 90),
    lng: parseCoordinate(body.lng, 'долгота', 180),
    payment,
    priceMinor,
    currency,
    sevaNote: sevaNote || null,
    contactPhone:
      body.contactPhone === undefined ||
      body.contactPhone === null ||
      body.contactPhone === ''
        ? null
        : parsePhone(body.contactPhone),
  };
}

/**
 * Сумма заявки: цена комнаты, а если её нет — цена объекта, умноженная на
 * ночи. null остаётся null: ночлег за служение суммы не имеет, и ноль на его
 * месте читался бы как «бесплатно», а это другое.
 */
export function calcTotalMinor(
  nights: number,
  stayPriceMinor: number | null,
  roomPriceMinor: number | null,
): number | null {
  const perNight = roomPriceMinor ?? stayPriceMinor;
  if (perNight === null) return null;
  return perNight * nights;
}
