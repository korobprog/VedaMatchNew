/**
 * Общее хранилище вида доски: «По важности» (VED-51) и «По дате» (VED-160) —
 * один и тот же выбор «как разложить карточки раздела», не два независимых.
 * Включённых сразу два быть не может — непонятно, что рисовать, — поэтому
 * состояние одно и ключ в `localStorage` тоже один: через полгода третий
 * режим не заведёт третий ключ рядом с этими двумя.
 *
 * Как и раньше у важности — это вид на устройстве, а не общее решение о
 * доске: включив его у себя, человек не перестраивает раздел соседу.
 *
 * Ключ до VED-160 назывался `vedamatch:work-grouped:<boardId>` и хранил
 * только `"1"` (группировка по важности включена) — булев флаг, второго
 * режима тогда не было. При первом чтении по новому ключу старое значение
 * переносится в новый формат («1» → `"priority"`) и старый ключ удаляется:
 * иначе человек, включивший «По важности» до выката VED-160, молча теряет
 * выбор — новый код о старом ключе не знал бы ничего.
 */

export type WorkGroupMode = "none" | "priority" | "date";

const STORAGE_PREFIX = "vedamatch:work-view:";
const LEGACY_STORAGE_PREFIX = "vedamatch:work-grouped:";

function viewModeKey(boardId: string): string {
  return `${STORAGE_PREFIX}${boardId}`;
}

function legacyGroupedKey(boardId: string): string {
  return `${LEGACY_STORAGE_PREFIX}${boardId}`;
}

/** Ключ — на доску: у среды их несколько, и вид одной ничего не говорит о соседней. */
export function readWorkGroupMode(boardId: string): WorkGroupMode {
  try {
    const stored = window.localStorage.getItem(viewModeKey(boardId));
    if (stored === "priority" || stored === "date") return stored;

    // Новый ключ пуст — проверяем старый, оставшийся с VED-51, и переносим
    // его значение один раз: следующее чтение пойдёт уже по новому ключу.
    const legacyKey = legacyGroupedKey(boardId);
    if (window.localStorage.getItem(legacyKey) === "1") {
      window.localStorage.setItem(viewModeKey(boardId), "priority");
      window.localStorage.removeItem(legacyKey);
      return "priority";
    }
    return "none";
  } catch {
    // Приватный режим: выбор вида живёт до перезагрузки.
    return "none";
  }
}

export function writeWorkGroupMode(boardId: string, mode: WorkGroupMode): void {
  try {
    if (mode === "none") window.localStorage.removeItem(viewModeKey(boardId));
    else window.localStorage.setItem(viewModeKey(boardId), mode);
  } catch {
    // То же самое: не смогли запомнить — доска от этого не ломается.
  }
}
