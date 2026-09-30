export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Расстояние по большому кругу между двумя точками, километры. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Длина ломаной по остановкам, километры с одним знаком. */
export function routeDistanceKm(stops: readonly GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i += 1) {
    total += haversineKm(stops[i - 1], stops[i]);
  }
  return Math.round(total * 10) / 10;
}

/** «850 м» до километра, «3,4 км» до десяти, дальше «12 км». */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} м`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} км`;
  return `${Math.round(km)} км`;
}
