import type { VacancyPlacePrecision } from '@vedamatch/shared';

/**
 * Огрубление координат. Копия правила из notices/notice-geo.ts: контракт
 * запрещает импортировать хелперы чужого модуля.
 *
 * Сетка 0,02° — около двух километров. При точности `city` точка человека
 * ложится на узел сетки уже на записи, и точное место нигде не сохраняется.
 */
export const CITY_COORD_GRID = 0.02;

export function coarsenCityCoord(value: number): number {
  return Math.round(value / CITY_COORD_GRID) * CITY_COORD_GRID;
}

export function coordsForPrecision(
  lat: number,
  lon: number,
  precision: VacancyPlacePrecision,
): { lat: number; lon: number } {
  if (precision === 'exact') return { lat, lon };
  return { lat: coarsenCityCoord(lat), lon: coarsenCityCoord(lon) };
}
