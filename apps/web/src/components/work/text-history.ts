/**
 * История правок описания карточки (VED-679): кнопки «Отменить» и
 * «Вернуть» рядом с полем.
 *
 * Своя, а не браузерная (Ctrl+Z): на телефоне её нечем вызвать, а поле
 * управляется React — встроенная отмена в нём ведёт себя непредсказуемо.
 *
 * Набор подряд склеивается в один шаг: отмена по букве заставила бы жать
 * кнопку десятки раз. Новый шаг начинается после паузы в наборе.
 */

export interface TextHistory {
  /** Прошлые состояния, последнее — ближайшее. */
  past: string[];
  present: string;
  /** Отменённые состояния, первое — ближайшее для «Вернуть». */
  future: string[];
  /** Время последней записи — для склейки набора подряд. */
  lastEditAt: number;
}

/** Пауза в наборе, после которой правка — новый шаг отмены. */
export const TEXT_HISTORY_GROUP_MS = 800;
/** Сколько шагов помнить: длинная сессия правки не должна копить память. */
export const TEXT_HISTORY_LIMIT = 100;

export function createTextHistory(value: string): TextHistory {
  return { past: [], present: value, future: [], lastEditAt: 0 };
}

/** Новое значение из поля. Правка стирает «Вернуть», как в редакторах. */
export function recordText(
  history: TextHistory,
  value: string,
  now: number,
): TextHistory {
  if (value === history.present) return history;
  const grouped =
    history.past.length > 0 &&
    history.future.length === 0 &&
    now - history.lastEditAt < TEXT_HISTORY_GROUP_MS;
  const past = grouped
    ? history.past
    : [...history.past, history.present].slice(-TEXT_HISTORY_LIMIT);
  return { past, present: value, future: [], lastEditAt: now };
}

export function undoText(history: TextHistory): TextHistory {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastEditAt: 0,
  };
}

export function redoText(history: TextHistory): TextHistory {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
    lastEditAt: 0,
  };
}
