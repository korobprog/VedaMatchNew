export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Расстояние по большой окружности; для пеших маршрутов точности с запасом. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Длина маршрута по прямым между соседними остановками. Дорог мы не знаем,
 * поэтому это оценка снизу; один знак после запятой — больше она не тянет.
 */
export function routeDistanceKm(stops: readonly GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i += 1) {
    total += haversineKm(stops[i - 1], stops[i]);
  }
  return Math.round(total * 10) / 10;
}
