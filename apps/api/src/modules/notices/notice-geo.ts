import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Гео доски: радиус и рамка карты.
 *
 * Формулы скопированы из contacts-search-query.ts — контракт сервисного
 * модуля запрещает импортировать хелперы чужого модуля. Отличие в том, что у
 * объявления координаты лежат скалярными колонками, а не в JSON профиля,
 * поэтому `jsonb_typeof` здесь не нужен.
 */

/** Средний радиус Земли, км. */
export const EARTH_RADIUS_KM = 6371;
/** Длина одного градуса широты в километрах. */
export const KM_PER_DEGREE = 111.045;

export const MAX_RADIUS_KM = 20_000;

/**
 * Сколько id может вернуть радиусный подзапрос. Радиус применяется двумя
 * шагами: сначала SQL с рамкой и гаверсинусом отдаёт идентификаторы, потом
 * они уходят в общий `where` ленты. Так курсорная пагинация по-прежнему
 * строится из ОДНОГО условия — фильтрации после выборки нет.
 *
 * Потолок нужен, чтобы «радиус 20 000 км» не превратился в выгрузку всей
 * таблицы одним массивом. На доске общины он недостижим.
 */
export const MAX_RADIUS_MATCHES = 5000;

export interface RadiusFilter {
  radiusKm: number;
  lat: number;
  lon: number;
}

/**
 * Радиус из query. `null` — фильтра нет.
 *
 * Точка и радиус приходят парой: точка без радиуса ничего не сужает, а
 * радиус без точки не от чего отсчитывать.
 */
export function parseRadius(
  query: Record<string, string | undefined>,
): RadiusFilter | null {
  if (query.radiusKm === undefined) return null;
  const radiusKm = Number(query.radiusKm);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0)
    throw new BadRequestException('Радиус указан неверно');
  if (radiusKm > MAX_RADIUS_KM)
    throw new BadRequestException('Слишком большой радиус');

  const lat = Number(query.lat);
  const lon = Number(query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon))
    throw new BadRequestException(
      'Поиск по радиусу требует города или точки на карте',
    );
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
    throw new BadRequestException('Точка указана неверно');

  return { radiusKm, lat, lon };
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  /** null — рамку по долготе не ставим, см. комментарий в boundingBox. */
  minLon: number | null;
  maxLon: number | null;
}

/**
 * Грубая рамка вокруг точки: она отсекает подавляющее большинство строк
 * дёшево, точный гаверсинус считается уже на остатке.
 *
 * Возле полюсов градус долготы вырождается, а у меридиана ±180 рамка
 * распадается на два интервала. В обоих случаях рамку по долготе просто не
 * ставим — гаверсинус всё равно даёт верный ответ, просто перебрав больше строк.
 */
export function boundingBox(
  centerLat: number,
  centerLon: number,
  radiusKm: number,
): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE;
  const rawMinLat = centerLat - latDelta;
  const rawMaxLat = centerLat + latDelta;
  const box: BoundingBox = {
    minLat: Math.max(-90, rawMinLat),
    maxLat: Math.min(90, rawMaxLat),
    minLon: null,
    maxLon: null,
  };

  // Рамка дотянулась до полюса: там сходятся все меридианы, ограничивать
  // долготу нечем.
  if (rawMinLat <= -90 || rawMaxLat >= 90) return box;

  // Дельта считается по краю рамки, ближнему к полюсу, а НЕ по центральной
  // широте: градус долготы там короче всего, и рамка по центру отрезала бы
  // точки, которые в радиус попадают. В contacts-search-query.ts дельта
  // берётся от центра — на городских радиусах разница незаметна, на больших
  // это ошибка, и повторять её здесь незачем.
  const worstLat = Math.max(Math.abs(box.minLat), Math.abs(box.maxLat));
  const cosLat = Math.cos((worstLat * Math.PI) / 180);
  if (cosLat <= 1e-6) return box;

  const lonDelta = radiusKm / (KM_PER_DEGREE * cosLat);
  if (lonDelta >= 180) return box;
  const minLon = centerLon - lonDelta;
  const maxLon = centerLon + lonDelta;
  // Пересечение антимеридиана разбило бы рамку на два интервала — проще
  // обойтись без неё, гаверсинус всё равно даёт верный ответ.
  if (minLon < -180 || maxLon > 180) return box;
  box.minLon = minLon;
  box.maxLon = maxLon;
  return box;
}

/** Расстояние между точками по большому кругу, км. */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * SQL, отдающий id объявлений внутри радиуса. Рамка плюс гаверсинус.
 *
 * Живость проверяется прямо здесь, а не только в общем `where` ленты: иначе
 * потолок MAX_RADIUS_MATCHES выедали бы протухшие и скрытые записи, и живые
 * объявления в радиусе просто не доходили бы до ленты. `now` передаётся, как
 * и в buildFeedWhere: живость определяется данными, а не воркером.
 */
export function radiusIdsSql(filter: RadiusFilter, now: Date): Prisma.Sql {
  const box = boundingBox(filter.lat, filter.lon, filter.radiusKm);
  const parts: Prisma.Sql[] = [
    Prisma.sql`"status" = 'published'`,
    Prisma.sql`"expiresAt" > ${now}`,
    Prisma.sql`"latitude" IS NOT NULL`,
    Prisma.sql`"longitude" IS NOT NULL`,
    Prisma.sql`"latitude" BETWEEN ${box.minLat} AND ${box.maxLat}`,
  ];
  if (box.minLon !== null && box.maxLon !== null)
    parts.push(Prisma.sql`"longitude" BETWEEN ${box.minLon} AND ${box.maxLon}`);
  parts.push(Prisma.sql`(
    ${EARTH_RADIUS_KM} * 2 * asin(least(1, sqrt(
      power(sin(radians("latitude" - ${filter.lat}) / 2), 2)
      + cos(radians(${filter.lat})) * cos(radians("latitude"))
        * power(sin(radians("longitude" - ${filter.lon}) / 2), 2)
    )))
  ) <= ${filter.radiusKm}`);

  return Prisma.sql`SELECT "id" FROM "Notice" WHERE ${Prisma.join(
    parts,
    ' AND ',
  )} LIMIT ${MAX_RADIUS_MATCHES}`;
}

// ===== Приватность места =====

/**
 * Шаг сетки, к которой прибиваются координаты объявлений с точностью
 * `city`. 0.02° ≈ 2,2 км по широте и ≈1,4 км по долготе в средних широтах:
 * метка остаётся «в городе», но по ней нельзя найти дом. Обычный путь —
 * центроид из `/geo/search` — от снапа почти не сдвигается; защита нужна
 * от клиента, который прислал точные координаты в обход формы, и от старых
 * записей (см. миграцию 20260819120000_notices_city_coords_coarsen).
 */
export const CITY_COORD_GRID = 0.02;

export function coarsenCityCoord(value: number): number {
  return Math.round(value / CITY_COORD_GRID) * CITY_COORD_GRID;
}

/**
 * Координаты для хранения/выдачи с учётом точности места. `exact` не
 * трогаем: он разрешён только общинам, где место общественное.
 */
export function coordsForPrecision(
  lat: number,
  lon: number,
  precision: 'city' | 'exact',
): { lat: number; lon: number } {
  if (precision === 'exact') return { lat, lon };
  return { lat: coarsenCityCoord(lat), lon: coarsenCityCoord(lon) };
}

// ===== Карта =====

/**
 * Порог, за которым карта переключается с точек на агрегаты по городам.
 * Триста меток браузер ещё рисует без плагина кластеризации; больше —
 * это уже каша, в которой ничего не разобрать.
 */
export const MAP_POINTS_CAP = 300;
/** Ниже этого зума точки не показываем: на карте страны они бессмысленны. */
export const MAP_POINTS_MIN_ZOOM = 9;

export type MapMode = 'points' | 'clusters';

/**
 * Режим карты решает сервер, а не клиент: только он знает, сколько записей
 * попало в рамку, и только так у клиента не появляется второй правды о том,
 * сколько объектов в точке.
 */
export function resolveMapMode(matches: number, zoom: number): MapMode {
  if (!Number.isFinite(zoom) || zoom < MAP_POINTS_MIN_ZOOM) return 'clusters';
  return matches > MAP_POINTS_CAP ? 'clusters' : 'points';
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Рамка видимой части карты. `null` — параметров нет или они мусорные. */
export function parseBounds(
  query: Record<string, string | undefined>,
): MapBounds | null {
  const minLat = Number(query.minLat);
  const maxLat = Number(query.maxLat);
  const minLon = Number(query.minLon);
  const maxLon = Number(query.maxLon);
  if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) return null;
  return {
    minLat: Math.min(minLat, maxLat),
    maxLat: Math.max(minLat, maxLat),
    minLon: Math.min(minLon, maxLon),
    maxLon: Math.max(minLon, maxLon),
  };
}

export function boundsWhere(bounds: MapBounds): Prisma.NoticeWhereInput {
  return {
    latitude: { gte: bounds.minLat, lte: bounds.maxLat },
    longitude: { gte: bounds.minLon, lte: bounds.maxLon },
  };
}
