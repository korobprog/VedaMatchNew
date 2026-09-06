import type {
  LineagePreference,
  MusicDurationBucket,
  MusicTrackSort,
} from '@vedamatch/shared';
import { isLineagePreference } from '@vedamatch/shared';

/**
 * Разбор строки запроса витрины и поиска.
 *
 * Отдельным модулем, а не внутри сервиса: здесь вся логика, которую есть
 * смысл проверять, — сервис вокруг только раскладывает результат в
 * Prisma-условия. Клиент присылает строки, и ни одной из них верить нельзя:
 * `limit=100000` и `sort=; DROP TABLE` приходят одинаково буднично.
 */

export const MUSIC_TRACKS_DEFAULT_LIMIT = 24;
export const MUSIC_TRACKS_MAX_LIMIT = 60;

const SORTS: MusicTrackSort[] = ['fresh', 'popular', 'title', 'duration'];
const BUCKETS: MusicDurationBucket[] = ['short', 'medium', 'long'];

/**
 * Границы корзин длительности, секунды.
 *
 * `short` — до 5 минут: бхаджан или прана́ма, помещается в дорогу до метро.
 * `medium` — до получаса: обычный киртан.
 * `long` — всё остальное: программа целиком, её слушают дома.
 */
export const MUSIC_DURATION_BUCKETS: Record<
  MusicDurationBucket,
  { min: number; max: number | null }
> = {
  short: { min: 0, max: 300 },
  medium: { min: 300, max: 1800 },
  long: { min: 1800, max: null },
};

export interface NormalizedMusicTrackQuery {
  q: string | null;
  category: string | null;
  artist: string | null;
  language: string | null;
  duration: MusicDurationBucket | null;
  live: boolean | null;
  /**
   * Явный выбор линии на один запрос: идентификатор или `all`; `null` —
   * не спрашивали, и сервис берёт настройку Музыки, а за ней профиль.
   */
  lineage: LineagePreference;
  sort: MusicTrackSort;
  cursor: string | null;
  limit: number;
}

/** Сырые значения из `@Query()`: всё либо строка, либо массив, либо ничего. */
export type RawQueryValue = string | string[] | undefined;

function firstString(value: RawQueryValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Тройное состояние: «да», «нет» и «не спрашивали». Именно третье, а не
 * `false`, отличает «покажи студийные» от «фильтр не поставлен».
 */
function optionalBoolean(value: RawQueryValue): boolean | null {
  const raw = firstString(value);
  if (raw === null) return null;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

function clampLimit(value: RawQueryValue): number {
  const raw = firstString(value);
  if (raw === null) return MUSIC_TRACKS_DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MUSIC_TRACKS_DEFAULT_LIMIT;
  }
  return Math.min(parsed, MUSIC_TRACKS_MAX_LIMIT);
}

/**
 * Поисковая строка. Длинную режем: осмысленного запроса длиннее сотни знаков
 * не бывает, а `ILIKE` по мегабайту — бесплатный способ занять базу.
 */
export const MUSIC_SEARCH_MAX_LENGTH = 100;

function normalizeSearch(value: RawQueryValue): string | null {
  const raw = firstString(value);
  if (raw === null) return null;
  return raw.replace(/\s+/g, ' ').slice(0, MUSIC_SEARCH_MAX_LENGTH);
}

export function normalizeMusicTrackQuery(query: {
  q?: RawQueryValue;
  category?: RawQueryValue;
  artist?: RawQueryValue;
  language?: RawQueryValue;
  duration?: RawQueryValue;
  live?: RawQueryValue;
  lineage?: RawQueryValue;
  sort?: RawQueryValue;
  cursor?: RawQueryValue;
  limit?: RawQueryValue;
}): NormalizedMusicTrackQuery {
  const sort = firstString(query.sort);
  const duration = firstString(query.duration);
  const lineage = firstString(query.lineage);

  return {
    q: normalizeSearch(query.q),
    category: firstString(query.category),
    artist: firstString(query.artist),
    language: firstString(query.language),
    duration: BUCKETS.includes(duration as MusicDurationBucket)
      ? (duration as MusicDurationBucket)
      : null,
    live: optionalBoolean(query.live),
    // Незнакомая линия — это «не спрашивали», а не пустая выдача.
    lineage: isLineagePreference(lineage) ? lineage : null,
    sort: SORTS.includes(sort as MusicTrackSort)
      ? (sort as MusicTrackSort)
      : 'fresh',
    cursor: firstString(query.cursor),
    limit: clampLimit(query.limit),
  };
}

/**
 * Условие по длительности для Prisma. Возвращает `null`, когда корзина не
 * выбрана, — чтобы сервис не подставлял в `where` пустой объект.
 */
export function durationCondition(
  bucket: MusicDurationBucket | null,
): { gte: number; lt?: number } | null {
  if (bucket === null) return null;
  const { min, max } = MUSIC_DURATION_BUCKETS[bucket];
  return max === null ? { gte: min } : { gte: min, lt: max };
}
