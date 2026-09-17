import type { MusicTrackDto } from "@vedamatch/shared";

/** Режим сортировки списка записей на странице исполнителя (VED-159). */
export type TrackSortMode = "date" | "alpha";

/**
 * Сортирует записи для отображения — на клиенте, без похода на сервер:
 * `getArtist()` (`music-catalog.service.ts`) всегда отдаёт весь список разом,
 * без `cursor`/`take`, так что пересортировка готового массива дешевле
 * нового query-параметра.
 *
 * `mode: "date"` по умолчанию убывает — новые сверху, совпадая с нынешним
 * серверным порядком (`orderBy: [{ publishedAt: "desc" }, { id: "desc" }]`).
 * `reverse` переворачивает уже готовый отсортированный список, а не меняет
 * знак сравнения, — одна и та же логика разворота для обоих режимов, без
 * дублирования компаратора.
 */
export function sortTracks(
  tracks: MusicTrackDto[],
  mode: TrackSortMode,
  reverse: boolean,
): MusicTrackDto[] {
  const sorted = [...tracks].sort((a, b) =>
    mode === "alpha"
      ? a.title.localeCompare(b.title, "ru")
      : // `publishedAt` может быть `null` (запись без даты публикации) —
        // пустая строка сравнивается меньше любой настоящей даты и падает
        // в конец при обычном порядке (новые сверху), что предсказуемо и
        // не роняет сравнение.
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
  );
  return reverse ? sorted.reverse() : sorted;
}
