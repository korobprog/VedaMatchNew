import type { WorkTaskPriority } from "@vedamatch/shared";
import { PRIORITY_TITLE } from "./task-priority";

/**
 * Группировка карточек раздела по важности (VED-51).
 *
 * Метка важности видна на карточке, но в разделе на полсотни задач срочное
 * рассыпано между обычным, и «что горит» приходится вылавливать глазами.
 * Группировка собирает их вместе, сверху вниз: срочное, важное, обычное, не
 * горит.
 *
 * Это вид, а не порядок: позиции карточек не трогаются, и выключенная
 * группировка возвращает раздел ровно таким, каким его выстроили руками.
 * Поэтому же группировка живёт на устройстве, как свёрнутые колонки
 * (см. column-collapse.ts): это привычка смотреть, а не общее решение о
 * доске — включив её у себя, человек не перестраивает раздел соседу.
 */

/** Сверху то, что горит. Список закрытый — он же задаёт порядок групп. */
const GROUP_ORDER: readonly WorkTaskPriority[] = [
  "urgent",
  "high",
  "normal",
  "low",
];

export interface TaskGroup<T> {
  priority: WorkTaskPriority;
  /** Те же слова, что в выборе важности: «Важная» и «Высокая» читались бы
   *  как две разные настройки. */
  title: string;
  tasks: T[];
}

/**
 * Разложить карточки по важности, сохранив их порядок внутри группы.
 *
 * Пустые группы не возвращаются: заголовок «Срочно» над пустотой сообщает о
 * разделе ровно то же, что его отсутствие, но занимает строку в каждом из
 * двенадцати разделов доски.
 */
export function groupTasksByPriority<T extends { priority: WorkTaskPriority }>(
  tasks: readonly T[],
): TaskGroup<T>[] {
  return GROUP_ORDER.map((priority) => ({
    priority,
    title: PRIORITY_TITLE[priority],
    tasks: tasks.filter((task) => task.priority === priority),
  })).filter((group) => group.tasks.length > 0);
}

export const PRIORITY_GROUPING_STORAGE_PREFIX = "vedamatch:work-grouped:";

export function priorityGroupingKey(boardId: string): string {
  return `${PRIORITY_GROUPING_STORAGE_PREFIX}${boardId}`;
}

/** Ключ — на доску: у среды их несколько, и вид одной ничего не говорит о соседней. */
export function readPriorityGrouping(boardId: string): boolean {
  try {
    return window.localStorage.getItem(priorityGroupingKey(boardId)) === "1";
  } catch {
    // Приватный режим: группировка живёт до перезагрузки.
    return false;
  }
}

export function writePriorityGrouping(boardId: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(priorityGroupingKey(boardId), "1");
    else window.localStorage.removeItem(priorityGroupingKey(boardId));
  } catch {
    // То же самое: не смогли запомнить — доска от этого не ломается.
  }
}
