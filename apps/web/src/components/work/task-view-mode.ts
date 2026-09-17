/**
 * Общее хранилище вида доски: «По важности» (VED-51) и «По дате» (VED-160) —
 * один и тот же выбор «как разложить карточки раздела», не два независимых.
 * Включённых сразу два быть не может — непонятно, что рисовать, — поэтому
 * состояние одно и ключ в `localStorage` тоже один: через полгода третий
 * режим не заведёт третий ключ рядом с этими двумя.
 *
 * Как и раньше у важности — это вид на устройстве, а не общее решение о
 * доске: включив его у себя, человек не перестраивает раздел соседу.
 */

export type WorkGroupMode = "none" | "priority" | "date";

const STORAGE_PREFIX = "vedamatch:work-view:";

function viewModeKey(boardId: string): string {
  return `${STORAGE_PREFIX}${boardId}`;
}

/** Ключ — на доску: у среды их несколько, и вид одной ничего не говорит о соседней. */
export function readWorkGroupMode(boardId: string): WorkGroupMode {
  try {
    const stored = window.localStorage.getItem(viewModeKey(boardId));
    return stored === "priority" || stored === "date" ? stored : "none";
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
