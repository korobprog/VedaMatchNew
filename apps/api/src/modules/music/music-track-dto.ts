import type {
  MusicAlbumDto,
  MusicAlbumKind,
  MusicArtistDto,
  MusicArtistKind,
  MusicCategoryDto,
  MusicTrackDetailDto,
  MusicTrackDto,
  MusicTrackStatus,
} from '@vedamatch/shared';
import { toLineageId } from '@vedamatch/shared';

/**
 * Сборка карточек каталога. Отдельным модулем и на своих типах, а не на
 * сгенерённых Prisma: собирать DTO — единственная часть чтения каталога, где
 * есть что проверять, и проверять её надо без базы.
 *
 * Правило подписи `resolveDisplayName()` здесь не нужно: в каталоге не
 * показывается ни одного имени пользователя. Загрузивший виден только
 * модератору — это придёт с очередью загрузок (этап 7).
 */

export interface MusicCoverSource {
  coverKey: string | null;
}

export interface MusicArtistRow extends MusicCoverSource {
  id: string;
  slug: string;
  name: string;
  kind: MusicArtistKind;
  bio: string | null;
  isVerified: boolean;
}

export interface MusicAlbumRow extends MusicCoverSource {
  id: string;
  slug: string;
  title: string;
  kind: MusicAlbumKind;
  year: number | null;
  artist: MusicArtistRow | null;
}

export interface MusicCategoryRow {
  id: string;
  slug: string;
  title: string;
  position: number;
}

export interface MusicTrackRow extends MusicCoverSource {
  id: string;
  title: string;
  durationSeconds: number;
  language: string | null;
  isLiveRecording: boolean;
  lineage: string | null;
  playCount: number;
  publishedAt: Date | null;
  artist: MusicArtistRow | null;
  album: MusicAlbumRow | null;
  categories: { category: MusicCategoryRow }[];
}

export interface MusicTrackDetailRow extends MusicTrackRow {
  status: MusicTrackStatus;
  sizeBytes: number;
  bitrateKbps: number | null;
  lyrics: string | null;
  transliteration: string | null;
  translation: string | null;
  moderationNote: string | null;
}

/**
 * Публичный адрес обложки. Обложки, в отличие от аудио, лежат открыто: их
 * кеширует CDN и они нужны в SSR-разметке.
 *
 * `null` возвращается и когда ключа нет, и когда бакет не настроен — на
 * незаполненном окружении карточка обязана отрисоваться заглушкой, а не
 * ссылкой в никуда.
 */
export function buildCoverUrl(
  publicBaseUrl: string | undefined,
  key: string | null,
): string | null {
  if (!key || !publicBaseUrl) return null;
  return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
}

/**
 * Обложка записи с запасными вариантами: своя, потом альбома, потом
 * исполнителя. В сетке каталога пустых плиток быть не должно — у отдельного
 * киртана своей обложки обычно нет, а у программы, из которой он вырезан,
 * есть.
 */
export function resolveTrackCoverKey(row: MusicTrackRow): string | null {
  return row.coverKey ?? row.album?.coverKey ?? row.artist?.coverKey ?? null;
}

function toArtistRef(artist: MusicArtistRow | null) {
  if (!artist) return null;
  return { id: artist.id, slug: artist.slug, name: artist.name };
}

function toAlbumRef(album: MusicAlbumRow | null) {
  if (!album) return null;
  return { id: album.id, slug: album.slug, title: album.title };
}

export function toMusicTrackDto(
  row: MusicTrackRow,
  publicBaseUrl: string | undefined,
): MusicTrackDto {
  return {
    id: row.id,
    title: row.title,
    artist: toArtistRef(row.artist),
    album: toAlbumRef(row.album),
    categories: row.categories.map(({ category }) => ({
      id: category.id,
      slug: category.slug,
      title: category.title,
    })),
    durationSeconds: row.durationSeconds,
    coverUrl: buildCoverUrl(publicBaseUrl, resolveTrackCoverKey(row)),
    language: row.language,
    isLiveRecording: row.isLiveRecording,
    lineage: toLineageId(row.lineage),
    playCount: row.playCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

export function toMusicTrackDetailDto(
  row: MusicTrackDetailRow,
  publicBaseUrl: string | undefined,
): MusicTrackDetailDto {
  return {
    ...toMusicTrackDto(row, publicBaseUrl),
    status: row.status,
    sizeBytes: row.sizeBytes,
    bitrateKbps: row.bitrateKbps,
    moderationNote: row.moderationNote,
    lyrics: {
      lyrics: row.lyrics,
      transliteration: row.transliteration,
      translation: row.translation,
    },
  };
}

export function toMusicArtistDto(
  row: MusicArtistRow,
  trackCount: number,
  publicBaseUrl: string | undefined,
): MusicArtistDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    bio: row.bio,
    coverUrl: buildCoverUrl(publicBaseUrl, row.coverKey),
    isVerified: row.isVerified,
    trackCount,
  };
}

export function toMusicAlbumDto(
  row: MusicAlbumRow,
  trackCount: number,
  publicBaseUrl: string | undefined,
): MusicAlbumDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    year: row.year,
    coverUrl: buildCoverUrl(
      publicBaseUrl,
      row.coverKey ?? row.artist?.coverKey ?? null,
    ),
    artist: toArtistRef(row.artist),
    trackCount,
  };
}

export function toMusicCategoryDto(
  row: MusicCategoryRow,
  trackCount: number,
): MusicCategoryDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    position: row.position,
    trackCount,
  };
}
