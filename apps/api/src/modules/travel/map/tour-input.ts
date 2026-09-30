import { BadRequestException } from '@nestjs/common';
import {
  TRAVEL_CURRENCIES,
  TRAVEL_MAP_TOUR_CAPACITY_MAX,
  TRAVEL_MAP_TOUR_MEETING_MAX,
  TRAVEL_MAP_TOUR_NOTE_MAX,
  TRAVEL_MAP_TOUR_PAYMENTS,
  TRAVEL_MAP_TOUR_TITLE_MAX,
  type TravelMapTourPayment,
} from '@vedamatch/shared';

/** Поля набора, приходящие от клиента. `title` пуст — подставится название маршрута. */
export interface CreateTourFields {
  routeId: string;
  title: string;
  startsAt: Date;
  timezone: string | null;
  meetingPoint: string;
  capacity: number | null;
  payment: TravelMapTourPayment;
  priceMinor: number | null;
  currency: string;
  note: string;
}

export type UpdateTourFields = Partial<Omit<CreateTourFields, 'routeId'>>;

const MEETING_MIN = 2;

let zones: Set<string> | null = null;
/** Список зон строим один раз: supportedValuesOf отдаёт сотни строк. */
function knownZones(): Set<string> {
  zones ??= new Set(Intl.supportedValuesOf('timeZone'));
  return zones;
}

/**
 * supportedValuesOf отдаёт только канонические имена (Asia/Calcutta), а форма
 * может прислать привычный алиас (Asia/Kolkata) — его принимает и сам Intl.
 */
function isKnownZone(zone: string): boolean {
  if (knownZones().has(zone)) return true;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Тело запроса должно быть объектом');
  }
  return body as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`Поле «${field}» должно быть текстом`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new BadRequestException(`Поле «${field}» длиннее ${max} знаков`);
  }
  return trimmed;
}

function parseStartsAt(value: unknown): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('Укажите дату и время экскурсии');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Дата указана неверно');
  }
  if (date.getTime() <= Date.now()) {
    throw new BadRequestException('Дата уже прошла');
  }
  return date;
}

function parseTimezone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !isKnownZone(value)) {
    throw new BadRequestException('Неизвестный часовой пояс');
  }
  return value;
}

function parseMeeting(value: unknown): string {
  const meeting = text(value, 'место встречи', TRAVEL_MAP_TOUR_MEETING_MAX);
  if (meeting.length < MEETING_MIN) {
    throw new BadRequestException('Укажите место встречи');
  }
  return meeting;
}

function parseCapacity(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > TRAVEL_MAP_TOUR_CAPACITY_MAX
  ) {
    throw new BadRequestException(
      `Число мест — целое от 1 до ${TRAVEL_MAP_TOUR_CAPACITY_MAX}`,
    );
  }
  return value;
}

function parsePayment(value: unknown): TravelMapTourPayment {
  if (
    typeof value === 'string' &&
    (TRAVEL_MAP_TOUR_PAYMENTS as readonly string[]).includes(value)
  ) {
    return value as TravelMapTourPayment;
  }
  throw new BadRequestException('Неизвестный вид оплаты');
}

function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException('Цена — целое неотрицательное число');
  }
  return value;
}

function parseCurrency(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'rub';
  if (
    typeof value === 'string' &&
    (TRAVEL_CURRENCIES as readonly string[]).includes(value)
  ) {
    return value;
  }
  throw new BadRequestException('Неизвестная валюта');
}

export function parseCreateTourInput(body: unknown): CreateTourFields {
  const input = asRecord(body);
  if (typeof input.routeId !== 'string' || !input.routeId.trim()) {
    throw new BadRequestException('Выберите маршрут');
  }
  const payment = parsePayment(input.payment);
  return {
    routeId: input.routeId.trim(),
    title:
      input.title == null
        ? ''
        : text(input.title, 'название', TRAVEL_MAP_TOUR_TITLE_MAX),
    startsAt: parseStartsAt(input.startsAt),
    timezone: parseTimezone(input.timezone),
    meetingPoint: parseMeeting(input.meetingPoint),
    capacity: parseCapacity(input.capacity),
    payment,
    // Цена осмысленна только при «за плату»: иначе она мусор в карточке.
    priceMinor: payment === 'paid' ? parsePrice(input.priceMinor) : null,
    currency: parseCurrency(input.currency),
    note:
      input.note == null
        ? ''
        : text(input.note, 'заметка', TRAVEL_MAP_TOUR_NOTE_MAX),
  };
}

/**
 * Правка: только присланные поля. Сброс цены при смене оплаты на не-`paid`
 * делает сервис — он знает прежнее значение, если `payment` не прислан.
 */
export function parseUpdateTourInput(body: unknown): UpdateTourFields {
  const input = asRecord(body);
  const out: UpdateTourFields = {};
  const has = (key: string) => input[key] !== undefined;
  if (has('title')) {
    out.title =
      input.title === null
        ? ''
        : text(input.title, 'название', TRAVEL_MAP_TOUR_TITLE_MAX);
  }
  if (has('startsAt')) out.startsAt = parseStartsAt(input.startsAt);
  if (has('timezone')) out.timezone = parseTimezone(input.timezone);
  if (has('meetingPoint')) out.meetingPoint = parseMeeting(input.meetingPoint);
  if (has('capacity')) out.capacity = parseCapacity(input.capacity);
  if (has('payment')) out.payment = parsePayment(input.payment);
  if (has('priceMinor')) out.priceMinor = parsePrice(input.priceMinor);
  if (has('currency')) out.currency = parseCurrency(input.currency);
  if (has('note')) {
    out.note =
      input.note === null
        ? ''
        : text(input.note, 'заметка', TRAVEL_MAP_TOUR_NOTE_MAX);
  }
  if (out.payment !== undefined && out.payment !== 'paid') {
    out.priceMinor = null;
  }
  return out;
}
