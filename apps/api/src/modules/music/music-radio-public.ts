import {
  MUSIC_RADIO_PUBLIC_AVATARS,
  MUSIC_RADIO_PUBLIC_NAMES,
  resolveDisplayName,
} from '@vedamatch/shared';

/** Слушатель эфира, которого можно показать гостю (VED-645). */
export interface PublicListenerRow {
  avatarUrl: string | null;
  name: string;
  spiritualName: string | null;
  homeLocation: unknown;
}

export interface PublicListenerSummary {
  avatars: string[];
  names: string[];
  cities: number;
}

/** Город из `User.homeLocation` (`ProfileLocation`), без регистра и пробелов. */
function cityKey(location: unknown): string | null {
  if (!location || typeof location !== 'object') return null;
  const city = (location as { city?: unknown }).city;
  if (typeof city !== 'string') return null;
  const key = city.trim().toLocaleLowerCase('ru');
  return key || null;
}

/**
 * Что публичная страница радио говорит о слушателях: фото, два имени и
 * число городов. Имя — только первое слово отображаемого (духовного, если
 * есть): «Нитай», а не полное имя с фамилией. Порядок строк — свежие
 * первыми, его задаёт запрос.
 */
export function publicListenerSummary(
  rows: readonly PublicListenerRow[],
): PublicListenerSummary {
  const avatars = rows
    .map((row) => row.avatarUrl)
    .filter((url): url is string => !!url)
    .slice(0, MUSIC_RADIO_PUBLIC_AVATARS);
  const names = rows
    .map((row) => resolveDisplayName(row).trim().split(/\s+/)[0] ?? '')
    .filter((name) => name.length > 0)
    .slice(0, MUSIC_RADIO_PUBLIC_NAMES);
  const cities = new Set(
    rows.map((row) => cityKey(row.homeLocation)).filter((key) => key),
  ).size;
  return { avatars, names, cities };
}
