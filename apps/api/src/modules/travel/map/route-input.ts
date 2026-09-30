import { BadRequestException } from '@nestjs/common';
import {
  TRAVEL_MAP_ROUTE_DESCRIPTION_MAX,
  TRAVEL_MAP_ROUTE_KINDS,
  TRAVEL_MAP_ROUTE_NAME_MAX,
  TRAVEL_MAP_ROUTE_STOPS_MAX,
  TRAVEL_MAP_ROUTE_STOPS_MIN,
  TRAVEL_MAP_ROUTE_STOP_NOTE_MAX,
  type TravelMapRouteKind,
} from '@vedamatch/shared';

const PLACE_TEXT_MAX = 120;

export interface RouteStopValue {
  /** id существующей остановки: по нему правка сохраняет фото и рассказ. */
  id: string | null;
  placeId: string | null;
  name: string;
  lat: number;
  lng: number;
  note: string;
}

export interface CreateRouteValue {
  kind: TravelMapRouteKind;
  name: string;
  description: string;
  city: string | null;
  country: string | null;
  stops: RouteStopValue[];
}

export type UpdateRouteValue = Partial<CreateRouteValue>;

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Ожидался объект с полями маршрута');
  }
  return body as Record<string, unknown>;
}

function text(value: unknown, label: string, min: number, max: number): string {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length < min || s.length > max) {
    throw new BadRequestException(
      min > 0
        ? `Поле «${label}» — от ${min} до ${max} символов`
        : `Поле «${label}» — не длиннее ${max} символов`,
    );
  }
  return s;
}

/** Пустое и null — «нет значения»: город у тропы в лесу указывать незачем. */
function nullableText(value: unknown, label: string, max: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`Поле «${label}» должно быть строкой`);
  }
  const s = value.trim();
  if (!s) return null;
  return text(s, label, 1, max);
}

function coord(value: unknown, label: string, limit: number): number {
  // Number('') === 0, поэтому строки не принимаем вовсе.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`Поле «${label}» должно быть числом`);
  }
  if (Math.abs(value) > limit) {
    throw new BadRequestException(`Поле «${label}» — от -${limit} до ${limit}`);
  }
  return value;
}

function parseStops(value: unknown): RouteStopValue[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('Остановки должны быть списком');
  }
  if (
    value.length < TRAVEL_MAP_ROUTE_STOPS_MIN ||
    value.length > TRAVEL_MAP_ROUTE_STOPS_MAX
  ) {
    throw new BadRequestException(
      `В маршруте от ${TRAVEL_MAP_ROUTE_STOPS_MIN} до ${TRAVEL_MAP_ROUTE_STOPS_MAX} остановок`,
    );
  }
  return value.map((item, index) => {
    const n = index + 1;
    const stop = asRecord(item);
    const placeId = stop.placeId;
    if (placeId !== undefined && placeId !== null) {
      if (typeof placeId !== 'string' || !placeId) {
        throw new BadRequestException(`Остановка ${n}: место указано неверно`);
      }
    }
    const id = stop.id;
    if (id !== undefined && id !== null && (typeof id !== 'string' || !id)) {
      throw new BadRequestException(`Остановка ${n}: id указан неверно`);
    }
    return {
      id: typeof id === 'string' ? id : null,
      placeId: typeof placeId === 'string' ? placeId : null,
      name: text(stop.name, `название остановки ${n}`, 1, PLACE_TEXT_MAX),
      lat: coord(stop.lat, `широта остановки ${n}`, 90),
      lng: coord(stop.lng, `долгота остановки ${n}`, 180),
      note:
        stop.note === undefined || stop.note === null
          ? ''
          : text(
              stop.note,
              `заметка остановки ${n}`,
              0,
              TRAVEL_MAP_ROUTE_STOP_NOTE_MAX,
            ),
    };
  });
}

function parseKind(value: unknown): TravelMapRouteKind {
  const kind = TRAVEL_MAP_ROUTE_KINDS.find((k) => k === value);
  if (!kind) throw new BadRequestException('Неизвестный вид маршрута');
  return kind;
}

export function parseCreateRouteInput(body: unknown): CreateRouteValue {
  const input = asRecord(body);
  return {
    kind: parseKind(input.kind),
    name: text(input.name, 'название', 2, TRAVEL_MAP_ROUTE_NAME_MAX),
    description:
      input.description === undefined || input.description === null
        ? ''
        : text(
            input.description,
            'описание',
            0,
            TRAVEL_MAP_ROUTE_DESCRIPTION_MAX,
          ),
    city: nullableText(input.city, 'город', PLACE_TEXT_MAX),
    country: nullableText(input.country, 'страна', PLACE_TEXT_MAX),
    stops: parseStops(input.stops),
  };
}

/** PATCH: только пришедшие поля, отсутствующий ключ не трогает значение. */
export function parseUpdateRouteInput(body: unknown): UpdateRouteValue {
  const input = asRecord(body);
  const out: UpdateRouteValue = {};
  if ('kind' in input) out.kind = parseKind(input.kind);
  if ('name' in input) {
    out.name = text(input.name, 'название', 2, TRAVEL_MAP_ROUTE_NAME_MAX);
  }
  if ('description' in input) {
    out.description =
      input.description === null
        ? ''
        : text(
            input.description,
            'описание',
            0,
            TRAVEL_MAP_ROUTE_DESCRIPTION_MAX,
          );
  }
  if ('city' in input)
    out.city = nullableText(input.city, 'город', PLACE_TEXT_MAX);
  if ('country' in input) {
    out.country = nullableText(input.country, 'страна', PLACE_TEXT_MAX);
  }
  if ('stops' in input) out.stops = parseStops(input.stops);
  if (Object.keys(out).length === 0) {
    throw new BadRequestException('Нечего менять');
  }
  return out;
}
