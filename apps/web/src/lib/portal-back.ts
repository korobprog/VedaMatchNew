/**
 * Аппаратная кнопка «назад» в режиме двух окон (VED-354).
 *
 * История браузера во вкладке одна, а окон портала два, и записи в ней
 * перемешаны: переключение окна кладёт туда адрес другого окна. Поэтому
 * «назад» уводил не на шаг назад в том окне, где человек стоит, а в соседнее.
 *
 * Чинится не перестройкой навигации, а разбором `popstate`: браузер уже
 * сместился по своей истории и сообщил, куда попал, а портал решает, что это
 * значит для активного окна, и при расхождении правит адрес на свой
 * (`router.replace`, а не `push`: шаг назад не обязан плодить запись вперёд).
 *
 * Здесь только решение — чистая функция над состоянием окон и адресом, куда
 * увёл браузер. Слушатель, роутер и прокрутка живут в
 * `components/quick/portal-windows-tracker.tsx`.
 */

import type { PortalHistoryDirection } from "./portal-history-seq";
import {
  type PortalWindowEntry,
  type PortalWindowsState,
} from "./portal-windows";

export type PortalHistoryPlan =
  /**
   * Шаг внутри активного окна. `navigate` — адрес, куда вести роутер;
   * `null` — браузер и так попал куда надо, трогать его незачем.
   */
  | {
      kind: "back" | "forward";
      state: PortalWindowsState;
      target: PortalWindowEntry;
      navigate: string | null;
    }
  /**
   * В активном окне шагать некуда: человек вышел за начало его истории.
   * Спорить с браузером тут нельзя — «назад» обязан в конце концов уводить с
   * портала, иначе вкладка становится ловушкой. Если адрес, куда он попал,
   * принадлежит другому окну, активным становится оно: это честная запись
   * общей истории вкладки, и делать вид, что человек всё ещё в прежнем окне,
   * значило бы врать подписи на кнопке.
   */
  | { kind: "leave"; state: PortalWindowsState; target: PortalWindowEntry | null };

/**
 * Что означает `popstate` с адресом `landed` для окон портала.
 *
 * `direction` приходит из `portal-history-seq.ts`: сам адрес направление не
 * выдаёт. По адресу его и пробовали угадывать — «попали туда, где лежит
 * следующая запись окна, значит вперёд», — но после первого же исправленного
 * шага назад в истории вкладки остаётся устаревшая запись с ровно таким
 * адресом, и второе нажатие «назад» уезжало вперёд.
 */
export function planPortalHistoryStep(
  state: PortalWindowsState,
  landed: string,
  direction: PortalHistoryDirection = -1,
): PortalHistoryPlan {
  const active = state.windows[state.active];
  if (!active || active.at < 0) return { kind: "leave", state, target: null };

  if (direction === 1) {
    const ahead = active.entries[active.at + 1];
    if (!ahead) return adopt(state, landed);
    return {
      kind: "forward",
      state: moveTo(state, active.at + 1),
      target: ahead,
      navigate: ahead.url === landed ? null : ahead.url,
    };
  }

  if (active.at === 0) return adopt(state, landed);

  const behind = active.entries[active.at - 1];
  return {
    kind: "back",
    state: moveTo(state, active.at - 1),
    target: behind,
    navigate: behind.url === landed ? null : behind.url,
  };
}

/**
 * Найти окно, которому принадлежит адрес, и отдать ему управление. Ищем
 * ровно ту запись, на которой стоит браузер, — совпадение адреса в середине
 * чужой истории означает, что человек вернулся именно туда.
 */
function adopt(state: PortalWindowsState, landed: string): PortalHistoryPlan {
  for (let index = 0; index < state.windows.length; index += 1) {
    if (index === state.active) continue;
    const window = state.windows[index];
    const at = window.entries.findIndex((entry) => entry.url === landed);
    if (at === -1) continue;
    const windows = [...state.windows];
    windows[index] = { entries: window.entries, at };
    return {
      kind: "leave",
      state: { windows, active: index },
      target: window.entries[at],
    };
  }
  return { kind: "leave", state, target: null };
}

function moveTo(state: PortalWindowsState, at: number): PortalWindowsState {
  const windows = [...state.windows];
  const window = windows[state.active];
  windows[state.active] = { entries: window.entries, at };
  return { windows, active: state.active };
}
