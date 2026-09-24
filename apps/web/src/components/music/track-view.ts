/**
 * Вид списка записей: строками или плитками (VED-225, VED-390).
 *
 * Выбор — привычка человека, а не часть ссылки: живёт в `localStorage` и
 * переживает переход на страницу записи и обратно. У витрины и у страницы
 * исполнителя ключи разные: по умолчанию витрина — плитки, а исполнитель —
 * строки (там сортировка и длинные названия), и общий ключ перекидывал бы
 * выбор с одной страницы на другую против её умолчания.
 */

export type TrackView = "list" | "grid";

export const CATALOG_VIEW_KEY = "vm.music.view";
export const ARTIST_VIEW_KEY = "vm.music.artist-view";

/** Разбор сохранённого. Незнакомое и пустое — умолчание страницы. */
export function parseTrackView(
  raw: string | null | undefined,
  fallback: TrackView,
): TrackView {
  return raw === "list" || raw === "grid" ? raw : fallback;
}
