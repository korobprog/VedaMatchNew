/**
 * Прогресс воспроизведения ↔ позиция в секундах ↔ столбик волны, куда
 * попал палец. Вынесено из компонента плеера, чтобы проверить арифметику
 * без `expo-audio` и жестов.
 */

/** Доля прослушанного, 0..1. Без длительности (файл ещё грузится) — 0. */
export function progressFromTime(currentSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.max(0, Math.min(1, currentSec / durationSec));
}

/** Куда по дорожке попал палец (0..1) — ширину даёт `onLayout`, x — событие жеста. */
export function ratioFromTouch(x: number, width: number): number {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(1, x / width));
}

/** Секунда, соответствующая доле дорожки, — обратное к `progressFromTime`. */
export function timeFromRatio(ratio: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.max(0, Math.min(1, ratio)) * durationSec;
}

/** Сколько из `totalBars` столбиков считать «пройденными» при данном прогрессе. */
export function playedBarCount(totalBars: number, progress: number): number {
  if (totalBars <= 0) return 0;
  const clamped = Math.max(0, Math.min(1, progress));
  return Math.round(totalBars * clamped);
}
