/**
 * Сколько ещё осталось в открытой ленте (VED-640): картинок, открыток или
 * роликов после того, что сейчас на экране.
 *
 * `total` — сколько в ленте от первого поста первой страницы до конца (его
 * отдаёт сервер с первой страницей), `index` — место текущего поста в
 * загруженном списке. Сервер числа не прислал — `null`, счётчика нет.
 */
export function remainingAfter(
  total: number | undefined,
  index: number,
): number | null {
  if (total === undefined || !Number.isFinite(total) || index < 0) return null;
  return Math.max(0, total - index - 1);
}

/** Сколько число держится на экране после перелистывания. */
export const REMAINING_FLASH_MS = 1000;
