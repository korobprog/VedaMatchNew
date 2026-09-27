/**
 * Геометрия своего бегунка прокрутки (VED-478): «бегунок в тексте треков
 * удобно двигать пальцем». Полоса прокрутки браузера на телефоне накладная
 * и за неё не взяться, поэтому рядом с текстом — своя, с широкой областью
 * нажатия. Здесь только счёт, без DOM.
 */

/** Самый короткий бегунок: короче — не попасть пальцем. */
export const MIN_THUMB = 32;

export interface ThumbGeometry {
  top: number;
  height: number;
}

/** Где и какой бегунок; `null` — текст помещается, прокручивать нечего. */
export function thumbGeometry(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  trackHeight: number,
): ThumbGeometry | null {
  const range = scrollHeight - clientHeight;
  if (range <= 1 || trackHeight <= 0) return null;
  const height = Math.min(
    trackHeight,
    Math.max(MIN_THUMB, (trackHeight * clientHeight) / scrollHeight),
  );
  const ratio = Math.min(1, Math.max(0, scrollTop / range));
  return { top: (trackHeight - height) * ratio, height };
}

/** Куда прокрутить, если верх бегунка перетащили в `thumbTop`. */
export function scrollTopForThumb(
  thumbTop: number,
  trackHeight: number,
  thumbHeight: number,
  scrollRange: number,
): number {
  const room = trackHeight - thumbHeight;
  if (room <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, thumbTop / room));
  return ratio * scrollRange;
}
