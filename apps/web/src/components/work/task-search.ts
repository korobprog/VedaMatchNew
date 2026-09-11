import type { WorkBoardDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Поиск по задачам доски (VED-76): что считать запросом и что показать.
 *
 * Ищет сервер — описания и обсуждения в доску не грузятся, — а доска только
 * прячет несовпавшие карточки. Чистая часть отдельно: какие колонки остаются
 * и что сказать человеку, проверяется тестом.
 */

/** Пауза после последней буквы: запрос на каждую клавишу — лишняя нагрузка. */
export const TASK_SEARCH_DEBOUNCE_MS = 250;

/**
 * Одна буква находит полдоски и ничего не проясняет. Исключение — цифры:
 * «7» — это номер задачи, его и ищут.
 */
export function isTaskQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= 2 || /^\d+$/.test(trimmed);
}

export interface SearchColumn<Task> {
  id: string;
  tasks: Task[];
}

/**
 * Колонки с одними совпавшими карточками. Колонка без совпадений уходит
 * целиком: на телефоне колонки стоят столбиком, и десяток пустых заголовков
 * отодвигал бы найденное за экран.
 */
export function searchColumns<
  Task extends { id: string },
  Column extends SearchColumn<Task>,
>(columns: readonly Column[], matches: ReadonlySet<string>): Column[] {
  return columns
    .map((column) => ({
      ...column,
      tasks: column.tasks.filter((task) => matches.has(task.id)),
    }))
    .filter((column) => column.tasks.length > 0);
}

export function countTasks(board: Pick<WorkBoardDto, "columns">): number {
  return board.columns.reduce((sum, column) => sum + column.tasks.length, 0);
}

/** «Нашлось 3 задачи из 42» — чтобы было видно, что доска сейчас не вся. */
export function searchSummary(found: number, total: number): string {
  if (found === 0) return "Ничего не нашлось";
  return `${plural(found, "Нашлась", "Нашлось", "Нашлось")} ${found} ${plural(
    found,
    "задача",
    "задачи",
    "задач",
  )} из ${total}`;
}
