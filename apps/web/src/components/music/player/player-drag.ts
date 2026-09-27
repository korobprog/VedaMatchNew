/**
 * Открепление и перетаскивание плеера (VED-454): «чтобы плеер как в
 * свёрнутом, так и в развёрнутом виде можно было перетаскивать по экрану
 * долгим нажатием».
 *
 * Здесь только чистая логика — распознавание долгого нажатия, зажим в окне,
 * хранение. Указатель, таймер и стили — в `use-player-drag.ts`.
 *
 * Положение хранится **сдвигом от домашнего места**, а не координатами
 * угла: полоса меняет высоту (свёрнута/развёрнута, вынесенные кнопки,
 * ширина экрана), и сдвиг от низа переживает это без пересчёта — полоса
 * остаётся на той же высоте от нижнего края. Сдвиг рисуется CSS-свойством
 * `translate`, а не `transform`: тем занята анимация выката, и одно
 * затирало бы другое. `null` — полоса на месте, прикреплена.
 */

export type PlayerOffset = { x: number; y: number };

/** Полоса (свёрнутая и развёрнутая — одна) и пузырь двигаются порознь. */
export type PlayerPositions = {
  bar: PlayerOffset | null;
  bubble: PlayerOffset | null;
};

/** Прямоугольник в координатах окна. */
export type Box = { left: number; top: number; right: number; bottom: number };

/** По какой оси двигается: полоса во всю ширину — только по вертикали. */
export type DragAxes = "y" | "both";

export const PLAYER_POSITION_KEY = "vedamatch:music-player-position";

export const NO_POSITIONS: PlayerPositions = { bar: null, bubble: null };

/** Сколько держать палец, прежде чем полоса «отклеится». */
export const LONG_PRESS_MS = 400;

/**
 * Сдвиг, после которого это уже не удержание, а прокрутка страницы: жест
 * отдаётся браузеру, и страница едет как обычно.
 */
export const LONG_PRESS_SLOP_PX = 8;

/** Отпущена ближе этого к дому — прилипает обратно к низу. */
export const DOCK_SNAP_PX = 48;

/** Шаг кнопок «Выше»/«Ниже» — замена жеста по WCAG 2.5.7. */
export const NUDGE_STEP_PX = 48;

export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP_PX = 24;

/** Узкая полоса (уже окна на столько и больше) двигается и вбок. */
const BOTH_AXES_ROOM_PX = 24;

// ---------- Хранение ----------

function readOffset(value: unknown): PlayerOffset | null {
  if (!value || typeof value !== "object") return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

/** Разбор сохранённого. Битое и чужое — плеер на месте. */
export function parsePlayerPositions(
  raw: string | null | undefined,
): PlayerPositions {
  if (!raw) return NO_POSITIONS;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return NO_POSITIONS;
    const { bar, bubble } = data as { bar?: unknown; bubble?: unknown };
    return { bar: readOffset(bar), bubble: readOffset(bubble) };
  } catch {
    return NO_POSITIONS;
  }
}

export function serializePlayerPositions(positions: PlayerPositions): string {
  const round = (offset: PlayerOffset | null) =>
    offset ? { x: Math.round(offset.x), y: Math.round(offset.y) } : null;
  return JSON.stringify({
    bar: round(positions.bar),
    bubble: round(positions.bubble),
  });
}

// ---------- Жест ----------

/**
 * Долгое нажатие: `wait` — ещё держат, `cancel` — палец поехал, это
 * прокрутка, `fire` — отклеиваем. Сдвиг проверяется раньше времени: палец,
 * уехавший на 9 точек к 400-й миллисекунде, листает страницу, а не
 * хватает полосу.
 */
export function longPressPhase(
  press: { elapsedMs: number; dx: number; dy: number },
  delayMs = LONG_PRESS_MS,
  slopPx = LONG_PRESS_SLOP_PX,
): "wait" | "cancel" | "fire" {
  if (Math.hypot(press.dx, press.dy) > slopPx) return "cancel";
  return press.elapsedMs >= delayMs ? "fire" : "wait";
}

export type Tap = { at: number; x: number; y: number };

/** Второе нажатие рядом и вскоре после первого. */
export function isDoubleTap(previous: Tap | null, next: Tap): boolean {
  if (!previous) return false;
  const gap = next.at - previous.at;
  if (gap < 0 || gap > DOUBLE_TAP_MS) return false;
  return (
    Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_TAP_SLOP_PX
  );
}

// ---------- Геометрия ----------

/**
 * Где плееру можно стоять: окно без шапки портала и без вырезов
 * `safe-area`. Шапка — по её фактическому низу: на части разделов её нет
 * или она уехала вверх.
 */
export function viewportBounds(input: {
  width: number;
  height: number;
  insets: { top: number; right: number; bottom: number; left: number };
  headerBottom: number;
}): Box {
  const top = Math.max(input.insets.top, input.headerBottom, 0);
  return {
    left: input.insets.left,
    top: Math.min(top, input.height),
    right: input.width - input.insets.right,
    bottom: input.height - input.insets.bottom,
  };
}

export function dragAxes(home: Box, bounds: Box): DragAxes {
  const width = home.right - home.left;
  return width <= bounds.right - bounds.left - BOTH_AXES_ROOM_PX ? "both" : "y";
}

function clampAxis(value: number, low: number, high: number): number {
  // Плеер выше окна (развёрнутая полоса на лежащем телефоне): держим верх,
  // там название и кнопки записи.
  if (high < low) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * Зажать сдвиг так, чтобы плеер целиком стоял в `bounds`. `home` — где он
 * стоит без сдвига.
 */
export function clampOffset(
  offset: PlayerOffset,
  home: Box,
  bounds: Box,
  axes: DragAxes,
): PlayerOffset {
  const y = clampAxis(
    offset.y,
    bounds.top - home.top,
    bounds.bottom - home.bottom,
  );
  const x =
    axes === "both"
      ? clampAxis(offset.x, bounds.left - home.left, bounds.right - home.right)
      : 0;
  // `+ 0` — чтобы не хранить «-0» из Math.min/max.
  return { x: Math.round(x) + 0, y: Math.round(y) + 0 };
}

/** Отпустили у самого дома — прикрепить обратно (`null`). */
export function settleOffset(offset: PlayerOffset): PlayerOffset | null {
  if (offset.y > -DOCK_SNAP_PX && Math.abs(offset.x) < DOCK_SNAP_PX)
    return null;
  return offset;
}

export function nudgeOffset(
  offset: PlayerOffset | null,
  direction: "up" | "down",
  step = NUDGE_STEP_PX,
): PlayerOffset {
  const from = offset ?? { x: 0, y: 0 };
  return { x: from.x, y: from.y + (direction === "up" ? -step : step) };
}

/**
 * Куда открывать панели полосы (очередь, текст, настройки): туда, где
 * больше места. У нижнего края это всегда «вверх»; поднятую к шапке полосу
 * панель вверх уходила бы под шапку. `room` — высота, которую панели можно
 * занять, с полем 12 точек.
 */
export function popoverSide(
  bar: Box,
  bounds: Box,
): { side: "above" | "below"; room: number } {
  const above = bar.top - bounds.top - 12;
  const below = bounds.bottom - bar.bottom - 12;
  return below > above
    ? { side: "below", room: Math.max(0, Math.round(below)) }
    : { side: "above", room: Math.max(0, Math.round(above)) };
}
