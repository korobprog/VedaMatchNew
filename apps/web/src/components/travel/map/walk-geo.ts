import { formatDistance, haversineKm, type GeoPoint } from "./route-geo";

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Начальный азимут от точки к точке, градусы 0..360 (0 — север). */
export function bearingDeg(from: GeoPoint, to: GeoPoint): number {
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = [
  "на север",
  "на северо-восток",
  "на восток",
  "на юго-восток",
  "на юг",
  "на юго-запад",
  "на запад",
  "на северо-запад",
] as const;

/** Румб по-русски: сектор в 45° вокруг каждой из восьми сторон. */
export function compassLabel(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  return COMPASS[Math.floor(((normalized + 22.5) % 360) / 45)];
}

/** «До следующей: 320 м, на северо-восток». */
export function nextStopHint(pos: GeoPoint, stop: GeoPoint): string {
  const km = haversineKm(pos, stop);
  if (km < 0.02) return "Вы на месте";
  return `До следующей: ${formatDistance(km)}, ${compassLabel(bearingDeg(pos, stop))}`;
}
