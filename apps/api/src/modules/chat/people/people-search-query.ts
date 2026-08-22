import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ContactsAshram,
  ContactsFormat,
  SpiritualStage,
} from '@vedamatch/shared';

/**
 * Сборка условий поиска по справочнику. Вынесено из сервиса отдельным файлом
 * по одной причине: это чистые функции без Prisma-клиента, поэтому условие
 * видимости можно проверить тестами напрямую, а не через мок выдачи.
 *
 * Главное правило всего поиска: и выдача, и `total`, и `facets` строятся
 * из ОДНОГО И ТОГО ЖЕ `WHERE`. Фильтрация после выборки запрещена — она
 * дырявит пагинацию (страницы с пропусками) и разводит счётчики с выдачей.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 120;
const MAX_LIST_ITEMS = 20;
const MAX_RADIUS_KM = 20_000;
/** Средний радиус Земли, км — для гаверсинуса и грубой рамки. */
const EARTH_RADIUS_KM = 6371;
/** Длина одного градуса широты в километрах. */
const KM_PER_DEGREE = 111.045;

const STAGES: SpiritualStage[] = ['seeker', 'practitioner', 'yogi', 'devotee'];
const ASHRAMS: ContactsAshram[] = [
  'brahmachari',
  'grihastha',
  'vanaprastha',
  'sannyasi',
];
const FORMATS: ContactsFormat[] = ['online', 'offline', 'any'];

/** Фильтры после приведения типов и валидации. */
export interface NormalizedSearchFilters {
  q: string | null;
  city: string | null;
  country: string | null;
  radiusKm: number | null;
  /** Центр радиуса с карты. null — считаем от города смотрящего. */
  lat: number | null;
  lon: number | null;
  stages: SpiritualStage[];
  ashram: ContactsAshram[];
  tagIds: string[];
  languages: string[];
  format: ContactsFormat | null;
  verifiedDevoteeOnly: boolean;
  photoVerifiedOnly: boolean;
  page: number;
  pageSize: number;
}

/** Всё о смотрящем, что влияет на условие видимости. */
export interface SearchViewer {
  id: string;
  isVerifiedDevotee: boolean;
  /** Город в нормализованном виде (trim + lower); null — не заполнен. */
  cityKey: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * Строковый параметр запроса приходит либо один раз, либо повторно
 * (`?tagIds=a&tagIds=b`), либо через запятую (`?tagIds=a,b`) — принимаем оба
 * написания и любую их смесь.
 */
export function toStringList(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  const raw: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
  const items: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      throw new BadRequestException(`${label}: ожидается строка`);
    }
    for (const part of entry.split(',')) {
      const trimmed = part.trim();
      if (trimmed === '' || items.includes(trimmed)) continue;
      items.push(trimmed);
    }
  }
  if (items.length > MAX_LIST_ITEMS) {
    throw new BadRequestException(`${label}: не больше ${MAX_LIST_ITEMS}`);
  }
  return items;
}

function toSingle(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  // Повторённый ключ приходит массивом; берём последнее значение.
  const list: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
  const raw: unknown = list[list.length - 1];
  if (typeof raw !== 'string') {
    throw new BadRequestException(`${label}: ожидается строка`);
  }
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function toBoolean(value: unknown, label: string): boolean {
  const raw = toSingle(value, label);
  if (raw === null) return false;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new BadRequestException(`${label}: ожидается true или false`);
}

function toEnumList<T extends string>(
  value: unknown,
  allowed: T[],
  label: string,
): T[] {
  const items = toStringList(value, label);
  for (const item of items) {
    if (!allowed.includes(item as T)) {
      throw new BadRequestException(
        `${label}: недопустимое значение «${item}»`,
      );
    }
  }
  return items as T[];
}

function toInt(value: unknown, label: string): number | null {
  const raw = toSingle(value, label);
  if (raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`${label}: ожидается число`);
  }
  return Math.trunc(parsed);
}

/** Дробное число в границах: для координат `toInt` не годится. */
function toFloat(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | null {
  const raw = toSingle(value, label);
  if (raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new BadRequestException(`${label}: число от ${min} до ${max}`);
  }
  return parsed;
}

/** Query-параметры → фильтры. Всё опционально, всё нормализуется здесь. */
export function normalizeSearchFilters(
  query: Record<string, unknown> | undefined,
): NormalizedSearchFilters {
  const source = query ?? {};

  const q = toSingle(source.q, 'Запрос');
  if (q && q.length > MAX_QUERY_LENGTH) {
    throw new BadRequestException(
      `Запрос: не длиннее ${MAX_QUERY_LENGTH} символов`,
    );
  }

  const radiusKm = toInt(source.radiusKm, 'Радиус');
  if (radiusKm !== null && (radiusKm <= 0 || radiusKm > MAX_RADIUS_KM)) {
    throw new BadRequestException(
      `Радиус: число от 1 до ${MAX_RADIUS_KM} километров`,
    );
  }

  const page = toInt(source.page, 'Страница');
  const pageSize = toInt(source.pageSize, 'Размер страницы');

  // Координаты имеют смысл только парой: одна половина центра — это опечатка
  // клиента, и молча достроить её нечем.
  const lat = toFloat(source.lat, 'Широта', -90, 90);
  const lon = toFloat(source.lon, 'Долгота', -180, 180);
  if ((lat === null) !== (lon === null)) {
    throw new BadRequestException(
      'Центр поиска задаётся широтой и долготой вместе',
    );
  }

  return {
    q,
    city: toSingle(source.city, 'Город'),
    country: toSingle(source.country, 'Страна'),
    radiusKm,
    lat,
    lon,
    stages: toEnumList(source.stages, STAGES, 'Духовный этап'),
    ashram: toEnumList(source.ashram, ASHRAMS, 'Ашрам'),
    tagIds: toStringList(source.tagIds, 'Теги'),
    languages: toStringList(source.languages, 'Языки'),
    format: toEnumList(source.format, FORMATS, 'Формат').at(-1) ?? null,
    verifiedDevoteeOnly: toBoolean(
      source.verifiedDevoteeOnly,
      'Только подтверждённые преданные',
    ),
    photoVerifiedOnly: toBoolean(
      source.photoVerifiedOnly,
      'Только с проверенным фото',
    ),
    // Страница меньше первой — это опечатка клиента, а не повод для ошибки.
    page: page === null || page < 1 ? 1 : page,
    pageSize: clampPageSize(pageSize),
  };
}

function clampPageSize(value: number | null): number {
  if (value === null) return DEFAULT_PAGE_SIZE;
  if (value < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

/** Город/страна для сравнения: без регистра и краевых пробелов. */
export function normalizeLocationKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return key === '' ? null : key;
}

/** Экранирование спецсимволов ILIKE: `%`, `_` и сам escape-символ. */
function likePattern(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/** Нормализованный город владельца карточки прямо в SQL. */
const OWNER_CITY = Prisma.sql`lower(trim(u."homeLocation"->>'city'))`;
const OWNER_COUNTRY = Prisma.sql`lower(trim(u."homeLocation"->>'country'))`;
const OWNER_LAT = Prisma.sql`(u."homeLocation"->>'lat')::double precision`;
const OWNER_LON = Prisma.sql`(u."homeLocation"->>'lon')::double precision`;

/**
 * Условие видимости карточки в поиске. Отличается от `getCard`:
 * `by_link` в выдачу не попадает никогда — в этом весь смысл уровня,
 * а `hidden` не попадает тем более.
 *
 * Значения `visibility` здесь записаны SQL-литералами намеренно: это
 * константы кода, а не пользовательский ввод. Всё, что приходит снаружи,
 * идёт только плейсхолдерами.
 */
export function buildVisibilityCondition(
  viewer: SearchViewer,
  hiddenUserIds: Iterable<string>,
  now: Date,
): Prisma.Sql {
  const levels: Prisma.Sql[] = [Prisma.sql`p."visibility" = 'everyone'`];

  // Уровень «только подтверждённым преданным» просто отсутствует в условии,
  // если смотрящий не подтверждён: такие карточки не попадают в выдачу вовсе.
  if (viewer.isVerifiedDevotee) {
    levels.push(Prisma.sql`p."visibility" = 'verified_only'`);
  }

  // Пустой город с любой стороны — не совпадение, иначе «мой город»
  // открывал бы карточку всем, у кого локация не заполнена.
  if (viewer.cityKey) {
    levels.push(
      Prisma.sql`(p."visibility" = 'same_city' AND ${OWNER_CITY} = ${viewer.cityKey})`,
    );
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."status" = 'active'`,
    Prisma.sql`(p."pausedUntil" IS NULL OR p."pausedUntil" <= ${now})`,
    Prisma.sql`p."userId" <> ${viewer.id}`,
    Prisma.sql`(${Prisma.join(levels, ' OR ')})`,
  ];

  const hidden = [...hiddenUserIds];
  if (hidden.length > 0) {
    conditions.push(
      Prisma.sql`p."userId" NOT IN (${Prisma.join(hidden, ',')})`,
    );
  }

  return Prisma.join(conditions, ' AND ');
}

/** Условия пользовательских фильтров. Каждое — отдельный кусок `AND`. */
export function buildFilterConditions(
  filters: NormalizedSearchFilters,
  viewer: SearchViewer,
): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  if (filters.q) {
    const pattern = likePattern(filters.q);
    conditions.push(Prisma.sql`(
      p."headline" ILIKE ${pattern}
      OR u."about" ILIKE ${pattern}
      OR p."offers" ILIKE ${pattern}
      OR u."name" ILIKE ${pattern}
    )`);
  }

  const city = normalizeLocationKey(filters.city);
  if (city) conditions.push(Prisma.sql`${OWNER_CITY} = ${city}`);

  const country = normalizeLocationKey(filters.country);
  if (country) conditions.push(Prisma.sql`${OWNER_COUNTRY} = ${country}`);

  if (filters.radiusKm !== null) {
    conditions.push(buildRadiusCondition(filters, viewer));
  }

  if (filters.stages.length > 0) {
    conditions.push(
      Prisma.sql`u."spiritualStage"::text IN (${Prisma.join(filters.stages, ',')})`,
    );
  }

  if (filters.ashram.length > 0) {
    conditions.push(
      Prisma.sql`p."ashram"::text IN (${Prisma.join(filters.ashram, ',')})`,
    );
  }

  // Карточка с форматом «любой» подходит и под «онлайн», и под «офлайн»:
  // человек сказал, что ему всё равно, и выпадать из обеих выдач он не должен.
  // Сам фильтр 'any' означает «формат не важен» — то есть условия нет вовсе.
  if (filters.format && filters.format !== 'any') {
    conditions.push(Prisma.sql`p."format"::text IN (${filters.format}, 'any')`);
  }

  if (filters.languages.length > 0) {
    // Пересечение множеств: достаточно одного общего языка.
    conditions.push(
      Prisma.sql`u."languages" && ARRAY[${Prisma.join(filters.languages, ',')}]::text[]`,
    );
  }

  if (filters.tagIds.length > 0) {
    // Теги складываются по И: карточка должна иметь ВСЕ переданные теги.
    // «Пуджари + переводчик» — это человек, умеющий и то, и другое, а не
    // объединение двух списков; для ИЛИ клиент шлёт два запроса.
    conditions.push(Prisma.sql`(
      SELECT COUNT(DISTINCT link."tagId")
      FROM "ContactsProfileTag" link
      WHERE link."profileId" = p."id"
        AND link."tagId" IN (${Prisma.join(filters.tagIds, ',')})
    ) = ${filters.tagIds.length}`);
  }

  if (filters.verifiedDevoteeOnly) {
    // Та же проверка, что и в `isVerifiedDevotee`, только на стороне БД.
    conditions.push(
      Prisma.sql`(u."spiritualStage" = 'devotee' AND u."devoteeVerificationStatus" = 'confirmed')`,
    );
  }

  if (filters.photoVerifiedOnly) {
    conditions.push(Prisma.sql`u."photoVerifiedAt" IS NOT NULL`);
  }

  return conditions;
}

/**
 * Радиус вокруг точки. Центр — то, что выбрано на карте, иначе город
 * смотрящего: карта должна уметь искать там, куда её увели, а не только
 * вокруг дома автора запроса. Сначала грубая рамка по широте и долготе
 * (она отсекает подавляющее большинство строк дёшево), потом точный
 * гаверсинус на том, что осталось.
 */
function buildRadiusCondition(
  filters: Pick<NormalizedSearchFilters, 'radiusKm' | 'lat' | 'lon'>,
  viewer: SearchViewer,
): Prisma.Sql {
  const radiusKm = filters.radiusKm ?? 0;
  const centerLat = filters.lat ?? viewer.lat;
  const centerLon = filters.lon ?? viewer.lon;
  if (centerLat === null || centerLon === null) {
    throw new BadRequestException(
      'Поиск по радиусу требует указанного города с координатами в вашем профиле или точки на карте',
    );
  }

  const latDelta = radiusKm / KM_PER_DEGREE;
  const minLat = centerLat - latDelta;
  const maxLat = centerLat + latDelta;

  const parts: Prisma.Sql[] = [
    // jsonb_typeof вместо простого IS NOT NULL: приведение к double precision
    // упало бы на строковых координатах в старых записях.
    Prisma.sql`jsonb_typeof(u."homeLocation"->'lat') = 'number'`,
    Prisma.sql`jsonb_typeof(u."homeLocation"->'lon') = 'number'`,
    Prisma.sql`${OWNER_LAT} BETWEEN ${minLat} AND ${maxLat}`,
  ];

  // Возле полюсов градус долготы вырождается, а у самого меридиана ±180
  // рамка распадается на два интервала. В обоих случаях рамку по долготе
  // просто не ставим — гаверсинус ниже всё равно даёт верный ответ.
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  if (Math.abs(cosLat) > 1e-6) {
    const lonDelta = radiusKm / (KM_PER_DEGREE * Math.abs(cosLat));
    const minLon = centerLon - lonDelta;
    const maxLon = centerLon + lonDelta;
    if (lonDelta < 180 && minLon >= -180 && maxLon <= 180) {
      parts.push(Prisma.sql`${OWNER_LON} BETWEEN ${minLon} AND ${maxLon}`);
    }
  }

  parts.push(Prisma.sql`(
    ${EARTH_RADIUS_KM} * 2 * asin(least(1, sqrt(
      power(sin(radians(${OWNER_LAT} - ${centerLat}) / 2), 2)
      + cos(radians(${centerLat})) * cos(radians(${OWNER_LAT}))
        * power(sin(radians(${OWNER_LON} - ${centerLon}) / 2), 2)
    )))
  ) <= ${radiusKm}`);

  return Prisma.sql`(${Prisma.join(parts, ' AND ')})`;
}

/** Полное условие выборки: видимость + фильтры. Одно на выдачу и счётчики. */
export function buildSearchWhere(params: {
  filters: NormalizedSearchFilters;
  viewer: SearchViewer;
  hiddenUserIds: Iterable<string>;
  now: Date;
}): Prisma.Sql {
  const conditions = [
    buildVisibilityCondition(params.viewer, params.hiddenUserIds, params.now),
    ...buildFilterConditions(params.filters, params.viewer),
  ];
  return Prisma.join(conditions, ' AND ');
}

/**
 * Порядок выдачи. Финальный tiebreak по `id` обязателен: без него у карточек
 * с одинаковыми `lastSeenAt` и `createdAt` порядок между запросами не
 * определён, и одна и та же запись может прийти на двух страницах подряд
 * либо не прийти ни на одной.
 */
export const SEARCH_ORDER_BY = Prisma.sql`
  ORDER BY u."lastSeenAt" DESC NULLS LAST, p."createdAt" DESC, p."id" DESC
`;
