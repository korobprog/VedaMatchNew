import { artistNameKey, normalizeArtistName } from './artist-from-tag';

/**
 * Исполнитель из названия записи: «Jahnavi dasi - Maha Mantra».
 *
 * Разбор по тегу (`artist-from-tag`) помог не всем: в части коллекции тега
 * исполнителя нет вовсе, а имя стоит прямо в названии — так файлы назвали
 * при раздаче. На витрине это выглядело как «…dasi - Maha Mantra» и под ним
 * «Исполнитель не указан».
 *
 * Название — подсказка слабее тега: «Maha Mantra - Live» тоже «что-то - что-то».
 * Поэтому отсюда исполнитель только предлагается: в админке редакция видит,
 * откуда взято имя и каким станет название, и снимает лишнее до применения.
 * При заливке имя из названия лишь привязывает к уже заведённому исполнителю.
 */

export interface TitleSplit {
  artist: string;
  /** Название без имени исполнителя впереди. */
  title: string;
}

/** Тире с пробелами вокруг: «Hare-Krishna» — одно слово, а не «кто - что». */
const SEPARATOR = /\s+[-–—]\s+/;
/** «01 - …», «07. …» — номер дорожки из раздачи, а не имя. */
const TRACK_NUMBER = /^\d{1,3}\.?$/;
const LEADING_TRACK_NUMBER = /^\s*\d{1,3}[.)_]\s*/;
/**
 * Имя длиннее — скорее всего, само название с подзаголовком: «Шри Шри
 * Шикшаштака с комментарием… - часть 2».
 */
const MAX_ARTIST_WORDS = 6;
const MAX_ARTIST_LENGTH = 60;

export function splitArtistFromTitle(
  raw: string | null | undefined,
): TitleSplit | null {
  if (typeof raw !== 'string') return null;
  const parts = raw
    .replace(LEADING_TRACK_NUMBER, '')
    .trim()
    .split(SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 0 && TRACK_NUMBER.test(parts[0])) parts.shift();
  if (parts.length < 2) return null;

  const artist = normalizeArtistName(parts[0]);
  if (!artist) return null;
  if (
    artist.length > MAX_ARTIST_LENGTH ||
    artist.split(' ').length > MAX_ARTIST_WORDS ||
    !/\p{L}/u.test(artist)
  )
    return null;

  const title = parts.slice(1).join(' - ');
  if (title.length < 2) return null;
  return { artist, title };
}

/**
 * Название без имени исполнителя впереди, если там стоит именно он:
 * исполнитель «Aindra» и название «Aindra - Hare Krishna» → «Hare Krishna».
 * Чужое имя впереди не трогаем — это часть названия, а не повтор.
 */
export function titleWithoutArtist(title: string, artistName: string): string {
  const split = splitArtistFromTitle(title);
  if (!split) return title;
  return artistNameKey(split.artist) === artistNameKey(artistName)
    ? split.title
    : title;
}

export type ArtistSource = 'tag' | 'title';

export interface ResolvedTrackArtist {
  name: string;
  from: ArtistSource;
  /** Каким станет название; `null` — остаётся как есть. */
  title: string | null;
}

/**
 * Исполнитель записи: тег, иначе название. Название чистится от имени
 * впереди в обоих случаях — «Jahnavi dasi - Maha Mantra» с подписью
 * «Jahnavi dasi» ниже повторяет имя дважды.
 */
export function resolveTrackArtist(input: {
  artistTag: string | null;
  title: string | null;
}): ResolvedTrackArtist | null {
  const fromTag = normalizeArtistName(input.artistTag);
  if (fromTag) {
    const cleaned = input.title
      ? titleWithoutArtist(input.title, fromTag)
      : null;
    return {
      name: fromTag,
      from: 'tag',
      title: cleaned && cleaned !== input.title ? cleaned : null,
    };
  }
  const split = splitArtistFromTitle(input.title);
  if (!split) return null;
  return { name: split.artist, from: 'title', title: split.title };
}
