import type { MusicAdminTrackDto, MusicArtistDto } from "@vedamatch/shared";

/**
 * Чистая логика массовой смены исполнителя (VED-226): фильтр списка по
 * исполнителю, подсказка «перенесём к существующему или заведём нового» и
 * состояние «выбрать все показанные». Сервер сверяет имя так же — без учёта
 * регистра и с схлопнутыми пробелами, — иначе подсказка обещала бы одно, а
 * сервер делал другое.
 */

/** Значение фильтра: все, без исполнителя или идентификатор исполнителя. */
export type ArtistFilter = "" | "none" | string;

export const ARTIST_FILTER_ALL = "";
export const ARTIST_FILTER_NONE = "none";

export function filterByArtist(
  tracks: MusicAdminTrackDto[],
  filter: ArtistFilter,
): MusicAdminTrackDto[] {
  if (filter === ARTIST_FILTER_ALL) return tracks;
  if (filter === ARTIST_FILTER_NONE) return tracks.filter((t) => !t.artistId);
  return tracks.filter((t) => t.artistId === filter);
}

export function cleanArtistName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Исполнитель справочника с тем же именем — или `null`, если такого нет. */
export function findArtistByName(
  artists: MusicArtistDto[],
  raw: string,
): MusicArtistDto | null {
  const needle = cleanArtistName(raw).toLocaleLowerCase("ru");
  if (!needle) return null;
  return (
    artists.find(
      (artist) => cleanArtistName(artist.name).toLocaleLowerCase("ru") === needle,
    ) ?? null
  );
}

/** Состояние общей галочки над показанным списком. */
export function selectionState(
  shownIds: string[],
  selected: ReadonlySet<string>,
): "none" | "some" | "all" {
  const picked = shownIds.filter((id) => selected.has(id)).length;
  if (picked === 0) return "none";
  return picked === shownIds.length ? "all" : "some";
}

/** Общая галочка: всё показанное выбрано — снять его, иначе — добавить. */
export function toggleAllShown(
  shownIds: string[],
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  if (selectionState(shownIds, selected) === "all") {
    for (const id of shownIds) next.delete(id);
  } else {
    for (const id of shownIds) next.add(id);
  }
  return next;
}
