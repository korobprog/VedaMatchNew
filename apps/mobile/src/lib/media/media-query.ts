import { MUSIC_DEFAULT_TRACK_SORT, type MusicTrackSort } from '@vedamatch/shared';

/**
 * Запрос выдачи Медиатеки (VED-331) — та же строка, что строит сайт
 * (`apps/web/src/app/(portal)/music/page.tsx`), и те же правила, что
 * проверяет сервер (`music-catalog-query.ts`): незнакомое он молча
 * заменяет умолчанием, поэтому приложение незнакомого и не шлёт.
 */

export type MediaSort = MusicTrackSort;

/**
 * Ряд «Порядок». Умолчание — по алфавиту, общее с сайтом и сервером
 * (`MUSIC_DEFAULT_TRACK_SORT`, решение заказчика VED-273): знакомая запись
 * лежит там же, где вчера, а не уезжает от каждой новой загрузки.
 */
export const MEDIA_SORTS: readonly { value: MediaSort; label: string }[] = [
  { value: 'title', label: 'По алфавиту' },
  { value: 'fresh', label: 'Новое' },
  { value: 'popular', label: 'Популярное' },
];

/** Как `MUSIC_SEARCH_MAX_LENGTH` на сервере: длиннее он всё равно обрежет. */
export const MEDIA_SEARCH_MAX_LENGTH = 100;

/** Порция выдачи. Сервер больше 60 не отдаёт. */
export const MEDIA_PAGE_SIZE = 30;

export interface MediaFilter {
  /** Корневая вкладка — «Традиционное»/«Современное»; `null` — «Всё». */
  root: string | null;
  /** Стиль — киртан, бхаджан, лекция…; `null` — все стили. */
  category: string | null;
  query: string;
  sort: MediaSort;
}

export const DEFAULT_MEDIA_FILTER: MediaFilter = { root: null, category: null, query: '', sort: MUSIC_DEFAULT_TRACK_SORT };

/**
 * Поисковая строка как её поймёт сервер: пробелы схлопнуты, края срезаны,
 * длина ограничена. Пустое — «не ищем», а не «найти пустоту».
 */
export function normalizeMediaSearch(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, ' ').trim().slice(0, MEDIA_SEARCH_MAX_LENGTH).trim();
  return collapsed === '' ? null : collapsed;
}

/** Путь `GET /music/tracks` с фильтром и курсором следующей порции. */
export function mediaTracksPath(filter: MediaFilter, cursor: string | null, limit = MEDIA_PAGE_SIZE): string {
  const params = new URLSearchParams();
  const q = normalizeMediaSearch(filter.query);
  if (q) params.set('q', q);
  if (filter.root) params.set('root', filter.root);
  if (filter.category) params.set('category', filter.category);
  params.set('sort', filter.sort);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(Math.min(Math.max(1, Math.floor(limit)), 60)));
  return `/music/tracks?${params.toString()}`;
}

/** Ключ выборки: одинаковый — значит тот же список, перезагружать незачем. */
export function mediaFilterKey(filter: MediaFilter): string {
  return [filter.root ?? '', filter.category ?? '', normalizeMediaSearch(filter.query) ?? '', filter.sort].join('|');
}
