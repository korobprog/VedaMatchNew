/**
 * Что из Музыки уходит вместе с аккаунтом, а что остаётся.
 *
 * Отдельным чистым модулем, потому что решается здесь ровно одно, и цена
 * ошибки высокая в обе стороны: отдать лишний ключ — снести чужому человеку
 * запись из общего каталога, не отдать нужный — оставить сто мегабайт мусора
 * в бакете навсегда, потому что после каскада искать их будет негде.
 */

export interface PurgeableTrack {
  storageKey: string;
  /**
   * Дата публикации, а не статус: запись, снятая с витрины по жалобе, всё
   * равно однажды была в каталоге, и её файл — предмет разбирательства.
   * `null` — в общий каталог она не попадала ни разу.
   */
  publishedAt: Date | null;
}

export interface PurgeableUpload {
  storageKey: string;
}

export interface PurgeablePlaylist {
  coverKey: string | null;
}

export interface MusicPurgeInput {
  tracks: readonly PurgeableTrack[];
  uploads: readonly PurgeableUpload[];
  playlists: readonly PurgeablePlaylist[];
}

export interface MusicPurgeResult {
  storageKeys: string[];
  counts: {
    /** Записей, чьи файлы уходят. */
    musicTracks: number;
    /** Записей, остающихся в каталоге без автора. */
    musicTracksKept: number;
  };
}

/**
 * `uploadedById` у записи — `SetNull`: опубликованное переживает удаление
 * аккаунта, потому что каталог принадлежит порталу, а не тому, кто принёс
 * файл. Поэтому такие ключи в план не попадают.
 *
 * Незавершённые и отклонённые загрузки уходят: они никому, кроме автора, не
 * были доступны.
 */
export function collectMusicPurgeKeys(input: MusicPurgeInput): MusicPurgeResult {
  const kept = input.tracks.filter((track) => track.publishedAt !== null);
  const removed = input.tracks.filter((track) => track.publishedAt === null);

  const keys = [
    ...removed.map((track) => track.storageKey),
    ...input.uploads.map((upload) => upload.storageKey),
    ...input.playlists
      .map((playlist) => playlist.coverKey)
      .filter((key): key is string => Boolean(key)),
  ].filter((key) => typeof key === 'string' && key.length > 0);

  // Строка загрузки и заведённая по ней запись делят один ключ — портал
  // схлопнул бы дубль и сам, но отдавать его дважды значит врать в отчёте.
  const unique = [...new Set(keys)];

  // Ключи оставшихся записей не должны попасть в план даже случайно: они
  // могли совпасть с ключом загрузки, если запись успели опубликовать.
  const keptKeys = new Set(kept.map((track) => track.storageKey));

  return {
    storageKeys: unique.filter((key) => !keptKeys.has(key)),
    counts: {
      musicTracks: removed.length,
      musicTracksKept: kept.length,
    },
  };
}
