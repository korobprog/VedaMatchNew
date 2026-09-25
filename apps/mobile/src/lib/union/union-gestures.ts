/**
 * Арифметика жестов Знакомств — вынесена из компонентов, чтобы проверяться
 * без устройства: на экране вся тонкость в отличии тапа от свайпа и в
 * порогах, а их глазами не отладишь.
 *
 * Перенос `photo-tap.ts`, `photo-autoplay.ts` и порогов из `swipe-deck.tsx`
 * сайта. Пороги в dp те же, что в пикселях CSS на сайте: у телефона с сайтом
 * они и так совпадают по смыслу — «треть ширины карточки».
 */

/** Насколько далеко утащить карточку, чтобы решение засчиталось. */
export const SWIPE_DISTANCE = 110;

/**
 * Порог броска, dp/с. Короткий быстрый флик — такое же осознанное решение,
 * как долгое перетаскивание: без учёта скорости он упирался в дистанцию и
 * карточка отпрыгивала назад, хотя жест был уверенным.
 */
export const SWIPE_VELOCITY = 520;

export type SwipeDirection = 'left' | 'right' | 'up';

/**
 * Во что превращается отпущенный палец. Вверх проверяется первым: суперлайк
 * — самое редкое и дорогое решение (суточная квота), и диагональ «вверх-
 * вправо» на сайте тоже засчитывается им. `null` — недобросили, карточка
 * возвращается на место.
 *
 * Помечена `worklet`: вызывается прямо из обработчика жеста на потоке
 * интерфейса, без перехода в JS ради одного сравнения.
 */
export function swipeDirection(
  offset: { x: number; y: number },
  velocity: { x: number; y: number },
): SwipeDirection | null {
  'worklet';
  if (offset.y < -SWIPE_DISTANCE || velocity.y < -SWIPE_VELOCITY) return 'up';
  if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) return 'right';
  if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) return 'left';
  return null;
}

/** Куда улетает карточка: дальше края экрана, чтобы уход не обрывался на видимой границе. */
export function exitOffset(direction: SwipeDirection, width: number, height: number): { x: number; y: number } {
  'worklet';
  if (direction === 'up') return { x: 0, y: -(height * 1.2) };
  const x = width * 1.4;
  return { x: direction === 'right' ? x : -x, y: 40 };
}

/** Наклон карточки в градусах по смещению: ±14° на 200 dp, дальше не растёт. */
export function tiltDegrees(offsetX: number): number {
  'worklet';
  const clamped = Math.max(-200, Math.min(200, offsetX));
  return (clamped / 200) * 14;
}

/**
 * Проявление штампа «ЗНАКОМИМСЯ» / «ПРОПУСК» / «СУПЕРЛАЙК» по смещению:
 * от 40 до 140 dp — от нуля до полного. Раньше порога штамп не нужен:
 * лёгкое дрожание пальца не должно пугать надписью.
 */
export function stampOpacity(distance: number): number {
  'worklet';
  return Math.max(0, Math.min(1, (distance - 40) / 100));
}

/** Допустимое дрожание пальца при тапе по фото, dp. Больше — это уже свайп. */
export const TAP_SLOP = 10;

export function isTap(start: { x: number; y: number }, end: { x: number; y: number }): boolean {
  return Math.abs(end.x - start.x) <= TAP_SLOP && Math.abs(end.y - start.y) <= TAP_SLOP;
}

/** Тап по правой половине снимка — следующее фото, по левой — предыдущее, по кругу. */
export function tappedPhotoIndex({
  currentIndex,
  total,
  tapX,
  width,
}: {
  currentIndex: number;
  total: number;
  tapX: number;
  width: number;
}): number {
  if (total <= 0) return 0;
  const forward = tapX > width / 2;
  return forward ? (currentIndex + 1) % total : (currentIndex - 1 + total) % total;
}

/**
 * Автолистание фото: анкету читают дольше, чем смотрят первый снимок, и
 * остальные фото так и остаются неоткрытыми — о тапе по краю мало кто
 * догадывается. Через паузу карусель листает сама.
 */
export const AUTOPLAY_IDLE_MS = 10_000;
export const AUTOPLAY_STEP_MS = 5_000;

export function nextPhotoIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  const safe = Math.min(Math.max(0, current), total - 1);
  return (safe + 1) % total;
}

/**
 * Листать ли самим. Одно фото листать некуда; при «уменьшить движение» не
 * листаем вовсе — сама себя меняющая картинка и есть движение, от которого
 * человек отказался. Пауза — палец на карточке или раскрытая анкета.
 */
export function shouldAutoplay(total: number, reduceMotion: boolean, paused = false): boolean {
  return total > 1 && !reduceMotion && !paused;
}
