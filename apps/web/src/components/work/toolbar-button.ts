/**
 * Один вид для всех кнопок верхнего ряда доски (VED-280).
 *
 * Ряд собирается из двух файлов: «Свернуть все», «По дате», «По важности» и
 * «Архив» живут в `board-view.tsx`, «Пригласить» — в `invite-panel.tsx`.
 * Рамка, скругление и область нажатия были расписаны там четырьмя разными
 * наборами классов и успели разъехаться: у «Пригласить» рамки не было вовсе
 * (вместо неё стояла заливка `bg-glass`), размер текста у неё был `text-sm`
 * против `text-xs` у соседей, а «Свернуть все» обходилась без внутренних
 * отступов. Теперь набор один, и следующая правка темы не может развести
 * кнопки поодиночке.
 *
 * Нажатое состояние («По дате» / «По важности») меняет только цвет рамки и
 * текста — рамка остаётся той же толщины, чтобы кнопка не дёргалась на
 * пиксель при переключении. Видно его не только глазом: рядом стоит
 * `aria-pressed`.
 */

/**
 * Общая часть: форма, область нажатия, размер текста. Цвет рамки — отдельно.
 *
 * Поля `px-1.5` (VED-421): в ряд добавилась «По правке», и
 * четыре кнопки с «Архивом» на 360 точках иначе не помещались — «Архив»
 * уезжал строкой ниже. Область нажатия прежняя — не меньше 40×40
 * (WCAG 2.2, SC 2.5.8, с запасом).
 */
export const WORK_TOOLBAR_BUTTON_BASE =
  "flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl " +
  "border px-1.5 py-2 text-xs font-semibold";

/** Покой: рамка стеклянная, текст второго уровня. */
export const WORK_TOOLBAR_BUTTON_IDLE =
  "border-glass-brd text-text-1 hover:text-text-0";

/** Нажато: рамка бирюзовая, текст первого уровня. */
export const WORK_TOOLBAR_BUTTON_PRESSED = "border-cyan text-text-0";

export function workToolbarButtonClass(
  options: { pressed?: boolean; extra?: string } = {},
): string {
  const state = options.pressed
    ? WORK_TOOLBAR_BUTTON_PRESSED
    : WORK_TOOLBAR_BUTTON_IDLE;
  const extra = options.extra?.trim();
  return extra
    ? `${WORK_TOOLBAR_BUTTON_BASE} ${state} ${extra}`
    : `${WORK_TOOLBAR_BUTTON_BASE} ${state}`;
}
