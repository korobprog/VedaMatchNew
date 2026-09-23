/**
 * Распознавание свайпа от края экрана (VED-191).
 *
 * Боковое меню портала на телефоне выдвигается жестом: от правого края
 * влево — правое, от левого края вправо — такое же слева. Правила жеста
 * чистыми функциями здесь, слушатели касаний — в `use-edge-swipe.ts`.
 *
 * Чего жест не имеет права ломать:
 *
 * - горизонтальную прокрутку внутри страниц (карусели, таблицы, ленты
 *   вкладок). Поэтому жест начинается только у самого края
 *   (`EDGE_SWIPE_ZONE`), и даже там уступает элементу, который сам умеет
 *   листаться в эту сторону (`scrollAllowsEdgeSwipe`) или сам разбирает
 *   горизонтальные касания (`touchActionAllowsEdgeSwipe` — колода анкет в
 *   Знакомствах);
 * - вертикальную прокрутку страницы. Жест засчитывается только явно
 *   горизонтальным (`swipeVerdict`), а первое заметное вертикальное
 *   движение отменяет его насовсем;
 * - системный жест «назад» Android. Его полосу у края забирает система, и
 *   касание в ней до страницы просто не доходит (браузер получает
 *   `touchcancel`). Поэтому зона чуть шире той полосы: жест, начатый в
 *   паре миллиметров от края, достаётся порталу, а начатый у самой рамки —
 *   системе, как и раньше.
 */

export type SwipeDirection = "leftward" | "rightward";

export interface SwipePoint {
  x: number;
  y: number;
}

/**
 * Ширина полосы у края, откуда начинается жест, в CSS-пикселях.
 *
 * 32, а не 16–24: полоса системного «назад» в Android по умолчанию около
 * 24dp (на телефоне ~412px CSS-пиксель почти равен dp) и настраивается
 * шире. Зона уже неё целиком ушла бы системе, и жест портала на телефоне с
 * жестовой навигацией не срабатывал бы никогда. 32 оставляет порталу
 * полоску за системной, а карусели теряют только касания в 8% ширины у
 * самого края — и то лишь когда листать им в эту сторону уже некуда.
 */
export const EDGE_SWIPE_ZONE = 32;

/** Сдвиг, до которого движение пальца считается дрожанием, а не жестом. */
export const SWIPE_SLOP = 10;

/** Сколько провести пальцем внутрь экрана, чтобы панель открылась. */
export const SWIPE_DISTANCE = 48;

/**
 * Во сколько раз горизонталь обязана превосходить вертикаль. Два — это
 * угол меньше ~27° к горизонту: косой мазок при прокрутке ленты жестом не
 * считается.
 */
export const SWIPE_RATIO = 2;

/**
 * От какого края начато касание и куда тогда должен идти жест: от правого
 * края — влево (правая панель), от левого — вправо (левая панель). `null` —
 * касание не у края, жеста не будет.
 */
export function edgeSwipeDirection(
  x: number,
  viewportWidth: number,
  zone: number = EDGE_SWIPE_ZONE,
): SwipeDirection | null {
  if (viewportWidth <= zone * 2) return null;
  if (x <= zone) return "rightward";
  if (x >= viewportWidth - zone) return "leftward";
  return null;
}

/**
 * Что делать с жестом сейчас: `go` — засчитан, `wait` — ещё не ясно,
 * `cancel` — это не он (вертикальная прокрутка или движение не в ту
 * сторону), дальше касание не разбираем.
 */
export function swipeVerdict(
  start: SwipePoint,
  now: SwipePoint,
  direction: SwipeDirection,
): "go" | "wait" | "cancel" {
  const dx = now.x - start.x;
  const along = direction === "rightward" ? dx : -dx;
  const across = Math.abs(now.y - start.y);

  if (across > SWIPE_SLOP && across > Math.abs(dx)) return "cancel";
  if (along < -SWIPE_SLOP) return "cancel";
  if (along >= SWIPE_DISTANCE && along >= across * SWIPE_RATIO) return "go";
  return "wait";
}

export interface ScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/**
 * Уступает ли жест прокручиваемому элементу под пальцем.
 *
 * Палец, идущий влево, листает содержимое вперёд (`scrollLeft` растёт),
 * вправо — назад. Если элементу в эту сторону есть куда листаться, касание
 * принадлежит ему, а не панели. Докрученная до упора карусель жест
 * пропускает: листать ей всё равно некуда.
 *
 * `scrollLeft` у RTL-разметки отрицательный; портал RTL не знает, но модуль
 * считаем по абсолютной величине, чтобы не зависеть от этого.
 */
export function scrollAllowsEdgeSwipe(
  metrics: ScrollMetrics,
  direction: SwipeDirection,
): boolean {
  const max = metrics.scrollWidth - metrics.clientWidth;
  if (max <= 1) return true;
  const position = Math.abs(metrics.scrollLeft);
  return direction === "leftward" ? position >= max - 1 : position <= 1;
}

/**
 * Уступает ли жест элементу, который сам разбирает горизонтальные касания.
 *
 * `touch-action: pan-y` (или `none`) — это прямое заявление элемента «по
 * горизонтали меня не прокручивай, я разберусь сам»: так объявлена
 * карточка колоды анкет, которую смахивают влево и вправо. Жест от края
 * поверх неё открывал бы меню вместо «пропустить».
 */
export function touchActionAllowsEdgeSwipe(touchAction: string): boolean {
  const value = touchAction.trim().toLowerCase();
  if (value === "" || value === "auto" || value === "manipulation") return true;
  if (value === "none") return false;
  return value.split(/\s+/).some((part) => part.startsWith("pan-x"));
}
