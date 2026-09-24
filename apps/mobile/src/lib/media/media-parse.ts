/**
 * Разбор ответов сервиса «Медиатека» (`apps/api/src/modules/music/`, слаг
 * `music`) для приложения (VED-331).
 *
 * Ручки те же, что у сайта: витрина `/music/catalog`, выдача и поиск
 * `/music/tracks`, аудиокниги `/music/audiobooks`, ссылка на звук
 * `/music/tracks/:id/stream-url`. Типы DTO лежат в `@vedamatch/shared`, но
 * приложение — отдельная сборка, которая живёт на телефоне неделями: сервер
 * успеет поменяться, а старая сборка — нет. Поэтому ответ не приводится
 * типом «на веру», а разбирается: запись без `id` или названия отбрасывается,
 * обложка берётся только `https`-ссылкой (её же понесёт уведомление на
 * экран блокировки), длительность — только конечным неотрицательным числом.
 * Одна кривая запись не должна ронять весь список.
 *
 * Плеер и экраны работают с этими типами, а не с DTO: на этапе 2 очередь
 * и плейлисты придут из других ручек, а запись в очереди останется той же.
 */

export interface MediaTrack {
  id: string;
  title: string;
  /** Исполнитель или чтец строкой; `null` — не указан. */
  artist: string | null;
  /** Альбом или книга — третья строка в шторке. */
  album: string | null;
  coverUrl: string | null;
  /** Длительность из каталога; `0` — неизвестна (тогда верим плееру). */
  durationSeconds: number;
}

export interface MediaTrackPage {
  items: MediaTrack[];
  nextCursor: string | null;
}

export type MediaCategoryKind = 'root' | 'style';

export interface MediaCategory {
  id: string;
  slug: string;
  title: string;
  kind: MediaCategoryKind;
  position: number;
  trackCount: number;
}

export interface MediaCatalog {
  categories: MediaCategory[];
  totalTracks: number;
}

export interface MediaAudiobook {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  reader: string | null;
  coverUrl: string | null;
  chapterCount: number;
}

export interface MediaAudiobookPage {
  book: MediaAudiobook & { description: string | null };
  chapters: MediaTrack[];
}

export interface MediaStreamUrl {
  url: string;
  expiresInSeconds: number;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Только `https`: уведомление и экран блокировки грузят картинку сами. */
export function safeCoverUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  return /^https:\/\/[^\s]+$/i.test(url) ? url : null;
}

function refName(value: unknown, key: 'name' | 'title'): string | null {
  return isObject(value) ? text(value[key]) : null;
}

/** Одна запись каталога; `null` — запись непригодна для списка и плеера. */
export function parseMediaTrack(raw: unknown, fallback: { album?: string | null; coverUrl?: string | null } = {}): MediaTrack | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id);
  const title = text(raw.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    artist: refName(raw.artist, 'name'),
    album: refName(raw.album, 'title') ?? fallback.album ?? null,
    coverUrl: safeCoverUrl(raw.coverUrl) ?? fallback.coverUrl ?? null,
    durationSeconds: count(raw.durationSeconds),
  };
}

function parseTrackList(raw: unknown, fallback?: { album?: string | null; coverUrl?: string | null }): MediaTrack[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const tracks: MediaTrack[] = [];
  for (const item of raw) {
    const track = parseMediaTrack(item, fallback);
    // Повтор одной записи дал бы два ряда с одним ключом в списке.
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  return tracks;
}

/** Ответ `GET /music/tracks`. Нет курсора — это последняя порция. */
export function parseMediaTrackPage(raw: unknown): MediaTrackPage {
  if (!isObject(raw)) return { items: [], nextCursor: null };
  return { items: parseTrackList(raw.items), nextCursor: text(raw.nextCursor) };
}

export function parseMediaCategory(raw: unknown): MediaCategory | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id);
  const slug = text(raw.slug);
  const title = text(raw.title);
  if (!id || !slug || !title) return null;
  return {
    id,
    slug,
    title,
    // Незнакомый вид (сервер завёл третий) — обычный стиль, а не корневая
    // вкладка: вкладок всего две, и лишняя сломала бы их ряд.
    kind: raw.kind === 'root' ? 'root' : 'style',
    position: typeof raw.position === 'number' && Number.isFinite(raw.position) ? raw.position : 0,
    trackCount: count(raw.trackCount),
  };
}

/** Ответ `GET /music/catalog` — из витрины приложению нужны разделы. */
export function parseMediaCatalog(raw: unknown): MediaCatalog {
  if (!isObject(raw)) return { categories: [], totalTracks: 0 };
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map(parseMediaCategory).filter((item): item is MediaCategory => item !== null)
    : [];
  categories.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, 'ru'));
  return { categories, totalTracks: count(raw.totalTracks) };
}

export function parseMediaAudiobook(raw: unknown): MediaAudiobook | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id);
  const slug = text(raw.slug);
  const title = text(raw.title);
  if (!id || !slug || !title) return null;
  return {
    id,
    slug,
    title,
    author: text(raw.author),
    reader: refName(raw.reader, 'name'),
    coverUrl: safeCoverUrl(raw.coverUrl),
    chapterCount: count(raw.chapterCount),
  };
}

/** Ответ `GET /music/audiobooks`. Книги без глав не показываем: они пусты. */
export function parseMediaAudiobooks(raw: unknown): MediaAudiobook[] {
  if (!isObject(raw) || !Array.isArray(raw.books)) return [];
  return raw.books
    .map(parseMediaAudiobook)
    .filter((book): book is MediaAudiobook => book !== null && book.chapterCount > 0);
}

/**
 * Ответ `GET /music/audiobooks/:slug`. У главы своей обложки обычно нет —
 * берём обложку книги, а название книги идёт третьей строкой в шторку.
 */
export function parseMediaAudiobookPage(raw: unknown): MediaAudiobookPage | null {
  if (!isObject(raw)) return null;
  const book = parseMediaAudiobook(raw.book);
  if (!book) return null;
  const description = isObject(raw.book) ? text(raw.book.description) : null;
  return {
    book: { ...book, description },
    chapters: parseTrackList(raw.chapters, { album: book.title, coverUrl: book.coverUrl }),
  };
}

/**
 * Ответ `GET /music/tracks/:id/stream-url`. Ссылка подписана и живёт
 * `expiresInSeconds` (сейчас 6 часов); без неё играть нечего — бросаем.
 */
export function parseMediaStreamUrl(raw: unknown): MediaStreamUrl {
  const url = isObject(raw) ? text(raw.url) : null;
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('stream_url_missing');
  const expires = isObject(raw) ? count(raw.expiresInSeconds) : 0;
  return { url, expiresInSeconds: expires };
}
