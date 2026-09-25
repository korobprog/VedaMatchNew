/**
 * Порядок кнопок в панели Блог-ленты на главной (VED-497): «Настройки»
 * переставляют кнопки, но не убирают их — так попросил заказчик. Кнопка
 * «Настройки» не участвует: она всегда последняя, иначе её можно было бы
 * «потерять» перестановкой.
 *
 * Порядок живёт на устройстве (`localStorage`), как и выбор кнопки
 * календаря.
 */
export type HomePanelButton =
  | "calendar"
  | "write"
  | "feed"
  | "favorites"
  | "share"
  | "speak"
  | "hide";

export const HOME_PANEL_DEFAULT_ORDER: readonly HomePanelButton[] = [
  "calendar",
  "write",
  "feed",
  "favorites",
  "share",
  "speak",
  "hide",
];

export const HOME_PANEL_LABELS: Record<HomePanelButton, string> = {
  calendar: "Вайшнавский календарь",
  write: "Написать пост",
  feed: "Вся лента",
  favorites: "Избранное",
  share: "Поделиться",
  speak: "Озвучить",
  hide: "Убрать ленту",
};

export const HOME_PANEL_ORDER_KEY = "blog-home:panel-order";

/**
 * Сохранённый порядок → полный: незнакомое и повторы выбрасываются, кнопки,
 * появившиеся после сохранения, встают на своё место по умолчанию в конец.
 */
export function normalizePanelOrder(raw: unknown): HomePanelButton[] {
  const known = new Set<string>(HOME_PANEL_DEFAULT_ORDER);
  const seen = new Set<string>();
  const order: HomePanelButton[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && known.has(item) && !seen.has(item)) {
        seen.add(item);
        order.push(item as HomePanelButton);
      }
    }
  }
  for (const item of HOME_PANEL_DEFAULT_ORDER) {
    if (!seen.has(item)) order.push(item);
  }
  return order;
}

/** Сдвинуть кнопку на шаг; у края — без изменений. */
export function movePanelButton(
  order: readonly HomePanelButton[],
  id: HomePanelButton,
  direction: -1 | 1,
): HomePanelButton[] {
  const at = order.indexOf(id);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export function readPanelOrder(): HomePanelButton[] {
  try {
    const raw = window.localStorage.getItem(HOME_PANEL_ORDER_KEY);
    return normalizePanelOrder(raw ? JSON.parse(raw) : null);
  } catch {
    return [...HOME_PANEL_DEFAULT_ORDER];
  }
}

export function writePanelOrder(order: readonly HomePanelButton[]): void {
  try {
    window.localStorage.setItem(HOME_PANEL_ORDER_KEY, JSON.stringify(order));
  } catch {
    // Не запомнили — порядок проживёт до перезагрузки.
  }
}
