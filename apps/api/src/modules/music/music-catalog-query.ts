import type { LineagePreference, MusicTrackSort } from '@vedamatch/shared';
import {
  MUSIC_DEFAULT_TRACK_SORT,
  isLineagePreference,
  isMusicTrackSort,
} from '@vedamatch/shared';

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

export interface NormalizedMusicTrackQuery {
  q: string | null;
  /**
   * Корневая категория витрины — «Традиционное»/«Современное» (VED-165).
   * Отдельно от `category`: оба фильтруют как пересечение (AND), а не
   * замена, — трек с обоими тегами проходит оба условия сразу.
   */
  root: string | null;
  /** Стиль — прежний плоский список (киртан, бхаджан, мантра…). */
  category: string | null;
  artist: string | null;
  language: string | null;
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
  root?: RawQueryValue;
  category?: RawQueryValue;
  artist?: RawQueryValue;
  language?: RawQueryValue;
  live?: RawQueryValue;
  lineage?: RawQueryValue;
  sort?: RawQueryValue;
  cursor?: RawQueryValue;
  limit?: RawQueryValue;
}): NormalizedMusicTrackQuery {
  const sort = firstString(query.sort);
  const lineage = firstString(query.lineage);

  return {
    q: normalizeSearch(query.q),
    root: firstString(query.root),
    category: firstString(query.category),
    artist: firstString(query.artist),
    language: firstString(query.language),
    live: optionalBoolean(query.live),
    // Незнакомая линия — это «не спрашивали», а не пустая выдача.
    lineage: isLineagePreference(lineage) ? lineage : null,
    // Незнакомое значение — это «не просили», а не повод отдать пустое:
    // умолчание общее с витриной (`MUSIC_DEFAULT_TRACK_SORT`, VED-273) —
    // по алфавиту. Сам список знакомых порядков тоже общий
    // (`MUSIC_TRACK_SORTS`): ряд «Порядок» рисует чипы по нему же, и своя
    // копия здесь означала бы чип, который сервер молча заменит умолчанием.
    // Без `duration` (VED-165): сортировать по `durationSeconds` нечем —
    // у части записей колонка заполнена оценкой при загрузке и расходится с
    // файлом, поэтому старое `?sort=duration` попадает сюда же.
    sort: isMusicTrackSort(sort) ? sort : MUSIC_DEFAULT_TRACK_SORT,
    cursor: firstString(query.cursor),
    limit: clampLimit(query.limit),
  };
}
