/**
 * Где встать выпадающему меню у кнопки (VED-604): окно видно целиком всегда.
 *
 * Раньше меню было `absolute` внутри ряда кнопок и вставало от его правого
 * края. Стоило кнопке перенестись на новую строку слева или ряду оказаться
 * внутри карточки с `overflow-hidden`, как меню уезжало за край экрана или
 * обрезалось контейнером. Теперь меню рисуется порталом в `body` с `fixed`,
 * а место ему считает эта функция — чистая, без DOM, её проверяют тесты.
 *
 * Правила:
 * - на узком экране (≤ `sheetMaxWidth`) — нижний лист во всю ширину;
 * - по горизонтали — от левого края кнопки; не влезает вправо — от правого
 *   края кнопки; не влезает и так — прижато к краю экрана с отступом;
 * - по вертикали — под кнопкой; снизу мало места — над ней; не влезает ни
 *   там ни там — на ту сторону, где места больше, с `maxHeight` по месту и
 *   прокруткой внутри.
 */

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Size {
  width: number;
  height: number;
}

export type AnchoredPosition =
  | { mode: "sheet" }
  | {
      mode: "popover";
      placement: "bottom" | "top";
      top: number;
      left: number;
      width: number;
      maxHeight: number;
    };

export interface AnchoredOptions {
  /** Зазор между кнопкой и меню. */
  gap?: number;
  /** Минимальный отступ меню от края экрана. */
  margin?: number;
  /** С какого края кнопки меню встаёт сначала. */
  align?: "start" | "end";
  /** Экран этой ширины и уже — нижний лист. 0 — никогда. */
  sheetMaxWidth?: number;
}

/** Порог нижнего листа: телефоны в портретной ориентации. */
export const SHEET_MAX_WIDTH = 420;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function anchoredPosition(
  anchor: AnchorRect,
  panel: Size,
  viewport: Size,
  {
    gap = 8,
    margin = 8,
    align = "start",
    sheetMaxWidth = SHEET_MAX_WIDTH,
  }: AnchoredOptions = {},
): AnchoredPosition {
  if (viewport.width <= sheetMaxWidth) return { mode: "sheet" };

  const width = Math.max(0, Math.min(panel.width, viewport.width - 2 * margin));
  const maxLeft = viewport.width - margin - width;
  const fromStart = anchor.left;
  const fromEnd = anchor.right - width;
  const fits = (left: number) => left >= margin && left <= maxLeft;
  const [first, second] =
    align === "start" ? [fromStart, fromEnd] : [fromEnd, fromStart];
  const left = fits(first)
    ? first
    : fits(second)
      ? second
      : clamp(first, margin, maxLeft);

  const below = viewport.height - margin - (anchor.bottom + gap);
  const above = anchor.top - gap - margin;
  const available = viewport.height - 2 * margin;
  const height = Math.min(panel.height, available);

  let placement: "bottom" | "top";
  let maxHeight: number;
  if (height <= below) {
    placement = "bottom";
    maxHeight = below;
  } else if (height <= above) {
    placement = "top";
    maxHeight = above;
  } else if (below >= above) {
    placement = "bottom";
    maxHeight = below;
  } else {
    placement = "top";
    maxHeight = above;
  }
  // Кнопка у самого края или уехала за экран: места с её стороны почти нет.
  // Меню тогда не сжимается в щель, а встаёт в пределах экрана как есть.
  const minUsable = Math.min(height, 160);
  if (maxHeight < minUsable) maxHeight = Math.min(height, available);
  maxHeight = Math.max(0, Math.min(maxHeight, available));

  const shown = Math.min(height, maxHeight);
  const wanted =
    placement === "bottom" ? anchor.bottom + gap : anchor.top - gap - shown;
  const top = clamp(wanted, margin, viewport.height - margin - shown);

  return { mode: "popover", placement, top, left, width, maxHeight };
}
