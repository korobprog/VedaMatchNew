/**
 * Панель действий кассы: сверху или снизу и какие кнопки на ней. Настройка
 * — на устройстве (localStorage): у кассира на телефоне панель снизу под
 * большим пальцем, у хозяина на ноутбуке — сверху.
 */

export const CASH_PANEL_BUTTONS = [
  "add-income",
  "add-expense",
  "incomes",
  "expenses",
  "categories",
  "stats",
  "filter",
  "guests",
] as const;
export type CashPanelButton = (typeof CASH_PANEL_BUTTONS)[number];

export const CASH_PANEL_BUTTON_LABELS: Record<CashPanelButton, string> = {
  "add-income": "+ Доход",
  "add-expense": "− Расход",
  incomes: "Доходы",
  expenses: "Расходы",
  categories: "Категории",
  stats: "Статистика",
  filter: "Фильтр",
  guests: "Клиенты",
};

export type CashPanelPosition = "top" | "bottom";

export interface CashPanelSettings {
  position: CashPanelPosition;
  /** Порядок кнопок — порядок `CASH_PANEL_BUTTONS`, здесь только набор. */
  buttons: CashPanelButton[];
}

export const CASH_PANEL_STORAGE_KEY = "vm.travel.cash.panel";

export const DEFAULT_CASH_PANEL: CashPanelSettings = {
  position: "top",
  buttons: [...CASH_PANEL_BUTTONS],
};

/**
 * Разобрать сохранённое. Всё, что не распознано, — значения по умолчанию:
 * старая или испорченная запись в хранилище не должна оставить кассу без
 * кнопок.
 */
export function parseCashPanel(raw: string | null): CashPanelSettings {
  if (!raw) return DEFAULT_CASH_PANEL;
  try {
    const value = JSON.parse(raw) as Partial<CashPanelSettings>;
    const position = value.position === "bottom" ? "bottom" : "top";
    const stored = Array.isArray(value.buttons) ? value.buttons : null;
    const chosen = stored
      ? CASH_PANEL_BUTTONS.filter((button) => stored.includes(button))
      : DEFAULT_CASH_PANEL.buttons;
    return {
      position,
      // Пустая панель — это потерянная касса, а не настройка.
      buttons: chosen.length ? chosen : DEFAULT_CASH_PANEL.buttons,
    };
  } catch {
    return DEFAULT_CASH_PANEL;
  }
}

/** Включить или выключить кнопку. Последнюю кнопку выключить нельзя. */
export function toggleCashPanelButton(
  settings: CashPanelSettings,
  button: CashPanelButton,
): CashPanelSettings {
  const has = settings.buttons.includes(button);
  if (has && settings.buttons.length === 1) return settings;
  const next = has
    ? settings.buttons.filter((item) => item !== button)
    : CASH_PANEL_BUTTONS.filter(
        (item) => item === button || settings.buttons.includes(item),
      );
  return { ...settings, buttons: next };
}

export type CashHotkey = "income" | "expense" | "filter" | "stats";

/** Подсказки к кнопкам: `aria-keyshortcuts` и текст в настройках. */
export const CASH_HOTKEY_HINTS: Record<CashHotkey, string> = {
  income: "+",
  expense: "-",
  filter: "/",
  stats: "S",
};

/**
 * Горячие клавиши кассы. Не срабатывают, пока человек печатает в поле или
 * открыт диалог, и с модификаторами — Ctrl+Plus в браузере масштаб, а не
 * новый доход. «S» и «Ы» — одна клавиша в двух раскладках.
 */
export function cashHotkey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  editing: boolean;
  dialogOpen: boolean;
}): CashHotkey | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.editing || event.dialogOpen) return null;
  switch (event.key) {
    case "+":
    case "=":
      return "income";
    case "-":
      return "expense";
    case "/":
      return "filter";
    case "s":
    case "S":
    case "ы":
    case "Ы":
      return "stats";
    default:
      return null;
  }
}
