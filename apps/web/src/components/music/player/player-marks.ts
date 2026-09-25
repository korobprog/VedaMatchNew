import type { MusicBookmarkDto, MusicListenDto } from "@vedamatch/shared";
import { formatTrackDuration } from "@/lib/music-duration";

/**
 * Метки и история в панели плеера (VED-388): подписи, порядок, очередь.
 * Чистые функции под тестом — всё, что видно в панели словами.
 */

/** Метки записи — по месту в записи, как их и читают сверху вниз. */
export function sortBookmarks(items: MusicBookmarkDto[]): MusicBookmarkDto[] {
  return [...items].sort(
    (a, b) =>
      a.positionSeconds - b.positionSeconds || a.createdAt.localeCompare(b.createdAt),
  );
}

/** Новая или изменённая метка на своё место, без повторов по `id`. */
export function upsertBookmark(
  items: MusicBookmarkDto[],
  item: MusicBookmarkDto,
): MusicBookmarkDto[] {
  return sortBookmarks([...items.filter((row) => row.id !== item.id), item]);
}

/**
 * Где рисовать метки на дорожке (VED-450): доля длины записи в процентах.
 * Метки за концом (длительность уточнилась после пересчёта) прижимаются к
 * концу, совпадающие места рисуются одной засечкой.
 */
export function markPercents(
  positions: readonly number[],
  totalSeconds: number,
): number[] {
  if (!(totalSeconds > 0)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const position of positions) {
    if (!Number.isFinite(position) || position < 0) continue;
    const percent =
      Math.round(Math.min(100, (position / totalSeconds) * 100) * 10) / 10;
    if (seen.has(percent)) continue;
    seen.add(percent);
    out.push(percent);
  }
  return out.sort((a, b) => a - b);
}

/** Как метку назвать: подписью, а без неё — местом. */
export function bookmarkTitle(item: MusicBookmarkDto): string {
  return item.label ?? `Метка на ${formatTrackDuration(item.positionSeconds)}`;
}

/** Имя кнопки перехода: куда она ведёт, словами. */
export function bookmarkJumpLabel(item: MusicBookmarkDto): string {
  const at = formatTrackDuration(item.positionSeconds);
  return item.label ? `Перейти к метке ${at}: ${item.label}` : `Перейти к метке ${at}`;
}

/** Объявление после «Метка»: скринридер иначе не узнает, что что-то случилось. */
export function bookmarkSavedText(item: MusicBookmarkDto): string {
  return `Метка на ${formatTrackDuration(item.positionSeconds)} поставлена`;
}

/** Сколько строк истории показывает панель. Дальше — страница «История». */
export const PLAYER_HISTORY_LIMIT = 20;

/**
 * Очередь из истории: записи по порядку, без повторов. Одну лекцию слушают
 * три вечера подряд, и три одинаковых пункта в очереди читаются как сбой.
 */
export function historyQueue(items: MusicListenDto[]): string[] {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const item of items) {
    if (seen.has(item.track.id)) continue;
    seen.add(item.track.id);
    queue.push(item.track.id);
  }
  return queue;
}

/** Строки панели: одна на запись, самое свежее прослушивание сверху. */
export function historyRows(
  items: MusicListenDto[],
  limit = PLAYER_HISTORY_LIMIT,
): MusicListenDto[] {
  const seen = new Set<string>();
  const rows: MusicListenDto[] = [];
  for (const item of items) {
    if (seen.has(item.track.id)) continue;
    seen.add(item.track.id);
    rows.push(item);
    if (rows.length >= limit) break;
  }
  return rows;
}

/** Где продолжить: только если сервер знает недослушанное место. */
export function historyResumeAt(item: MusicListenDto): number | undefined {
  const at = item.positionSeconds;
  return typeof at === "number" && at > 0 ? at : undefined;
}
