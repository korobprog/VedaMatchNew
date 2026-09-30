import { BadRequestException } from '@nestjs/common';
import {
  LINEAGES,
  TRAVEL_MAP_LINEAGE_KINDS,
  TRAVEL_MAP_PLACE_ADDRESS_MAX,
  TRAVEL_MAP_PLACE_DESCRIPTION_MAX,
  TRAVEL_MAP_PLACE_HOURS_MAX,
  TRAVEL_MAP_PLACE_KINDS,
  TRAVEL_MAP_PLACE_NAME_MAX,
  TRAVEL_MAP_REPORT_REASON_MAX,
  type LineageId,
  type TravelMapPlaceKind,
} from '@vedamatch/shared';

/** Поля места, готовые к записи в `TravelMapPlace`. */
export interface PlaceFields {
  kind: TravelMapPlaceKind;
  name: string;
  lat: number;
  lng: number;
  description: string;
  address: string;
  city: string | null;
  country: string | null;
  lineage: LineageId | null;
  openingHours: string | null;
  website: string | null;
  phone: string | null;
  telegram: string | null;
}

const NAME_MIN = 2;
const CITY_MAX = 100;
const PHONE_MAX = 30;
const WEBSITE_MAX = 300;
const REASON_MIN = 5;

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Тело запроса должно быть объектом');
  }
  return body as Record<string, unknown>;
}

function has(body: Record<string, unknown>, key: string): boolean {
  return body[key] !== undefined;
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

/** Пустая строка и null означают «нет значения»: форма шлёт пустое поле. */
function optionalText(
  value: unknown,
  field: string,
  max: number,
): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field, max) || null;
}

function parseKind(value: unknown): TravelMapPlaceKind {
  if (
    typeof value === 'string' &&
    (TRAVEL_MAP_PLACE_KINDS as readonly string[]).includes(value)
  ) {
    return value as TravelMapPlaceKind;
  }
  throw new BadRequestException('Неизвестный вид места');
}

function parseName(value: unknown): string {
  const name = text(value, 'название', TRAVEL_MAP_PLACE_NAME_MAX).replace(
    /\s+/g,
    ' ',
  );
  if (name.length < NAME_MIN) {
    throw new BadRequestException(`Название короче ${NAME_MIN} знаков`);
  }
  return name;
}

function parseCoordinate(value: unknown, field: string, limit: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`Поле «${field}» должно быть числом`);
  }
  if (value < -limit || value > limit) {
    throw new BadRequestException(
      `Поле «${field}» вне диапазона от −${limit} до ${limit}`,
    );
  }
  return value;
}

/** Линия имеет смысл не у каждого вида; у кафе она всегда пуста. */
function parseLineage(
  value: unknown,
  kind: TravelMapPlaceKind,
): LineageId | null {
  if (value === null || value === undefined || value === '') return null;
  if (
    typeof value !== 'string' ||
    !LINEAGES.some((lineage) => lineage.id === value)
  ) {
    throw new BadRequestException('Неизвестная линия');
  }
  return TRAVEL_MAP_LINEAGE_KINDS.includes(kind) ? (value as LineageId) : null;
}

export function parseWebsite(value: unknown): string | null {
  const raw = optionalText(value, 'сайт', WEBSITE_MAX);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('Сайт должен быть ссылкой http или https');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('Сайт должен быть ссылкой http или https');
  }
  return url.toString();
}

/** `@name` или ссылка t.me/name — храним всегда как `@name`. */
export function parseTelegram(value: unknown): string | null {
  const raw = optionalText(value, 'Telegram', 100);
  if (!raw) return null;
  const fromLink = raw.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{3,32})\/?$/i,
  );
  const name = fromLink ? fromLink[1] : raw.replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{3,32}$/.test(name)) {
    throw new BadRequestException(
      'Telegram: укажите @имя или ссылку вида t.me/имя',
    );
  }
  return `@${name}`;
}

function parsePhone(value: unknown): string | null {
  return optionalText(value, 'телефон', PHONE_MAX);
}

/** Создание: обязательные вид, название и координаты, остальное по желанию. */
export function parseCreatePlaceInput(body: unknown): PlaceFields {
  const input = asRecord(body);
  const kind = parseKind(input.kind);
  return {
    kind,
    name: parseName(input.name),
    lat: parseCoordinate(input.lat, 'широта', 90),
    lng: parseCoordinate(input.lng, 'долгота', 180),
    description:
      optionalText(
        input.description,
        'описание',
        TRAVEL_MAP_PLACE_DESCRIPTION_MAX,
      ) ?? '',
    address:
      optionalText(input.address, 'адрес', TRAVEL_MAP_PLACE_ADDRESS_MAX) ?? '',
    city: optionalText(input.city, 'город', CITY_MAX),
    country: optionalText(input.country, 'страна', CITY_MAX),
    lineage: parseLineage(input.lineage, kind),
    openingHours: optionalText(
      input.openingHours,
      'часы работы',
      TRAVEL_MAP_PLACE_HOURS_MAX,
    ),
    website: parseWebsite(input.website),
    phone: parsePhone(input.phone),
    telegram: parseTelegram(input.telegram),
  };
}

/**
 * Правка: в результате только присланные поля. Если меняется вид, а линия
 * не прислана, линию нужно пересчитать по новому виду — это делает сервис,
 * зная текущий вид; здесь она проверяется по присланному или, при
 * отсутствии вида в теле, пропускается до слияния (`currentKind`).
 */
export function parseUpdatePlaceInput(
  body: unknown,
  currentKind?: TravelMapPlaceKind,
): Partial<PlaceFields> {
  const input = asRecord(body);
  const out: Partial<PlaceFields> = {};
  if (has(input, 'kind')) out.kind = parseKind(input.kind);
  if (has(input, 'name')) out.name = parseName(input.name);
  if (has(input, 'lat')) out.lat = parseCoordinate(input.lat, 'широта', 90);
  if (has(input, 'lng')) out.lng = parseCoordinate(input.lng, 'долгота', 180);
  if (has(input, 'description')) {
    out.description =
      optionalText(
        input.description,
        'описание',
        TRAVEL_MAP_PLACE_DESCRIPTION_MAX,
      ) ?? '';
  }
  if (has(input, 'address')) {
    out.address =
      optionalText(input.address, 'адрес', TRAVEL_MAP_PLACE_ADDRESS_MAX) ?? '';
  }
  if (has(input, 'city'))
    out.city = optionalText(input.city, 'город', CITY_MAX);
  if (has(input, 'country')) {
    out.country = optionalText(input.country, 'страна', CITY_MAX);
  }
  const effectiveKind = out.kind ?? currentKind;
  if (has(input, 'lineage')) {
    // Вид неизвестен (проверка без сервиса) — считаем, что линия допустима.
    out.lineage = parseLineage(input.lineage, effectiveKind ?? 'temple');
  } else if (out.kind && !TRAVEL_MAP_LINEAGE_KINDS.includes(out.kind)) {
    // Храм стал кафе — линия больше не имеет смысла.
    out.lineage = null;
  }
  if (has(input, 'openingHours')) {
    out.openingHours = optionalText(
      input.openingHours,
      'часы работы',
      TRAVEL_MAP_PLACE_HOURS_MAX,
    );
  }
  if (has(input, 'website')) out.website = parseWebsite(input.website);
  if (has(input, 'phone')) out.phone = parsePhone(input.phone);
  if (has(input, 'telegram')) out.telegram = parseTelegram(input.telegram);
  return out;
}

/** Причина жалобы: короче пяти знаков — это не причина. */
export function parseReportReason(body: unknown): string {
  const input = asRecord(body);
  const reason = text(input.reason, 'причина', TRAVEL_MAP_REPORT_REASON_MAX);
  if (reason.length < REASON_MIN) {
    throw new BadRequestException(
      `Опишите причину подробнее — не короче ${REASON_MIN} знаков`,
    );
  }
  return reason;
}

/** Причина скрытия необязательна: пустая означает «без пояснения». */
export function parseHideReason(body: unknown): string | null {
  if (body === undefined || body === null) return null;
  const input = asRecord(body);
  return optionalText(input.reason, 'причина', TRAVEL_MAP_REPORT_REASON_MAX);
}
