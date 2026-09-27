/**
 * Что уходит вместе с исполнителем, когда его удаляют с записями (VED-576).
 *
 * Отдельным чистым модулем: решается здесь ровно одно — какие строки и какие
 * объекты в бакете снять, — и ошибка дорогая в обе стороны. Лишний ключ —
 * чужая запись без файла; недостающий — мегабайты мусора, искать которые
 * после каскада уже негде.
 */

export interface ArtistDeleteTrack {
  id: string;
  storageKey: string;
  coverKey: string | null;
}

export interface ArtistDeleteAlbum {
  id: string;
  coverKey: string | null;
}

export interface ArtistDeleteInput {
  /** Обложка самого исполнителя — она только его. */
  artistCoverKey: string | null;
  tracks: readonly ArtistDeleteTrack[];
  /**
   * Только альбомы, в которых нет чужих записей: альбом, где остались
   * записи другого исполнителя, переживёт удаление (`SetNull`), и его
   * обложку снимать нельзя.
   */
  albums: readonly ArtistDeleteAlbum[];
}

export interface ArtistDeletePlan {
  trackIds: string[];
  albumIds: string[];
  /** Аудиофайлы — они же ключи строк загрузки. Без повторов. */
  storageKeys: string[];
  /** Обложки записей, альбомов и исполнителя. Без повторов и пустых. */
  coverKeys: string[];
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

export function planArtistDelete(input: ArtistDeleteInput): ArtistDeletePlan {
  return {
    trackIds: input.tracks.map((track) => track.id),
    albumIds: input.albums.map((album) => album.id),
    storageKeys: unique(input.tracks.map((track) => track.storageKey)),
    coverKeys: unique([
      ...input.tracks.map((track) => track.coverKey),
      ...input.albums.map((album) => album.coverKey),
      input.artistCoverKey,
    ]),
  };
}

/** `?withTracks=1` / `?withTracks=true` — остальное считается «нет». */
export function parseWithTracks(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}
