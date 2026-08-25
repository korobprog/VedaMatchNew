/**
 * Автолистание фотографий в колоде.
 *
 * Анкету читают дольше, чем смотрят первый снимок: человек дочитывает имя,
 * интересы, проценты — и остальные фото так и остаются неоткрытыми, потому
 * что о тапе по краю никто не догадывается. Через паузу карусель начинает
 * листать сама.
 */

/** Сколько ждём, прежде чем листать самим: до этого человек читает. */
export const AUTOPLAY_IDLE_MS = 10_000;

/** Шаг показа. Пять секунд — успеть рассмотреть, но не заскучать. */
export const AUTOPLAY_STEP_MS = 5_000;

/** Следующий снимок по кругу: последний ведёт к первому. */
export function nextPhotoIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  const safe = Math.min(Math.max(0, current), total - 1);
  return (safe + 1) % total;
}

/**
 * Листать ли самим.
 *
 * Один снимок листать некуда. При `prefers-reduced-motion` не листаем вовсе:
 * само-меняющаяся картинка — это движение, которого человек попросил не
 * делать, а тап по краю никуда не девается.
 */
export function shouldAutoplay(
  total: number,
  reduceMotion: boolean,
  paused = false,
): boolean {
  return total > 1 && !reduceMotion && !paused;
}
