/**
 * Перемотка с клавиатуры (VED-388): Shift+← и Shift+→ — на шаг из
 * настроек плеера, тот же, что у кнопок и у системной карточки.
 *
 * Почему Shift со стрелкой, а не одиночные буквы, как J/L у видеохостингов:
 * одиночная буква срабатывает у того, кто просто набирает текст, а
 * отключить её негде (WCAG 2.1.4). Стрелка без Shift занята прокруткой
 * страницы и ползунком дорожки. Alt+стрелка — «назад» браузера.
 *
 * Чистая функция: решение «наше ли это нажатие» — вся логика, и проверять
 * её на объектах дешевле, чем на настоящей клавиатуре.
 */

export interface HotkeyEventLike {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  defaultPrevented: boolean;
  repeat?: boolean;
}

export interface HotkeyTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  /** `type` у `<input>`: в ползунке Shift+стрелка двигает сам ползунок. */
  type?: string;
  /** `role` элемента: в табах и меню стрелки — их навигация. */
  role?: string | null;
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const ARROW_ROLES = new Set([
  "slider",
  "tab",
  "tablist",
  "menu",
  "menuitem",
  "listbox",
  "option",
  "radio",
  "radiogroup",
  "spinbutton",
  "textbox",
  "combobox",
]);

/** Стрелки здесь уже что-то значат — перехватывать их нельзя. */
export function targetOwnsArrows(target: HotkeyTargetLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (target.tagName && EDITABLE_TAGS.has(target.tagName.toUpperCase())) return true;
  if (target.role && ARROW_ROLES.has(target.role)) return true;
  return false;
}

/** `-1` — назад, `1` — вперёд, `null` — нажатие не наше. */
export function seekHotkeyDirection(
  event: HotkeyEventLike,
  target: HotkeyTargetLike | null | undefined,
): -1 | 1 | null {
  if (event.defaultPrevented) return null;
  if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (targetOwnsArrows(target)) return null;
  if (event.key === "ArrowLeft") return -1;
  if (event.key === "ArrowRight") return 1;
  return null;
}

/** Подсказка в панели настроек — рядом с шагами, где её и будут искать. */
export const SEEK_HOTKEYS_HINT = "Shift + ← и Shift + → на клавиатуре";
