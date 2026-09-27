/**
 * Кнопки вложений в «Работе» (VED-266): «Прикрепить» в карточке, «Выбрать»
 * в форме новой задачи и корзина у вложения.
 *
 * Жалоба была «срабатывает не с первого раза и непонятно, нажалось ли».
 * Причины три: видимая кнопка была ниже 40 точек (промах пальцем), нажатие
 * ничем не отзывалось, а пока карточка сохраняла что-то другое, поле файла
 * было выключено — и тап молча пропадал. Поэтому здесь:
 *
 * - область нажатия не меньше 40×40 (WCAG 2.2, SC 2.5.8, с запасом);
 * - `touch-manipulation` — браузер не ждёт двойного тапа для зума;
 * - `active:` меняет фон, рамку и цвет подписи, а при
 *   `prefers-reduced-motion: no-preference` кнопка ещё чуть проседает;
 * - занятое состояние видно (`peer-disabled:` / `disabled:`), а не только
 *   действует.
 *
 * Кнопка выбора файла — это `<label>` над спрятанным `input type="file"`:
 * input идёт первым с классом `peer sr-only`, видимая часть — соседний
 * `<span>` с этими классами. Клавиатурный фокус остаётся на input, а обводку
 * рисует span через `peer-focus-visible:`.
 */

const PRESS_FEEDBACK =
  "touch-manipulation select-none transition-[background-color,border-color,color,transform] duration-100 " +
  "motion-reduce:transition-none motion-safe:active:scale-[0.97]";

/** Видимая часть кнопки выбора файла: соседний span после `input.peer`. */
export const WORK_ATTACH_PICKER_CLASS =
  "inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-1.5 " +
  "rounded-xl border border-glass-brd bg-glass px-4 py-2 text-sm text-text-0 " +
  "hover:border-magenta active:border-magenta active:bg-magenta/15 active:text-magenta " +
  `${PRESS_FEEDBACK} ` +
  "peer-focus-visible:outline peer-focus-visible:outline-2 " +
  "peer-focus-visible:outline-offset-2 peer-focus-visible:outline-magenta " +
  "peer-disabled:cursor-wait peer-disabled:opacity-70";

/** Корзина у вложения: значок 16 точек, область нажатия 40×40. */
export const WORK_ATTACH_REMOVE_CLASS =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-1 " +
  "hover:text-magenta active:bg-magenta/15 active:text-magenta " +
  `${PRESS_FEEDBACK} ` +
  "disabled:cursor-wait disabled:opacity-50";
