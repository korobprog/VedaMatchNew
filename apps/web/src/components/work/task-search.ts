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

/**
 * «Показать все» (VED-131) — вся доска, а не одни находки, но поиск при этом
 * остаётся: запрос стоит в поле, найденные карточки выделены.
 *
 * Два круга эта кнопка сбрасывала поиск. Заказчик: «нажимаешь на неё и не
 * отображается запрос» — и это буквально то, что происходило: поле пустело,
 * находки растворялись среди сотни карточек, и понять, где они, было уже
 * нельзя. Кнопка обещала «все», а забирала найденное. Теперь «все» — это вся
 * доска вместе с найденным, а вернуться к одним находкам можно той же кнопкой
 * («Только найденные»). Сбросить поиск целиком — крестик в поле или Escape.
 */
export function searchBoardColumns<
  Task extends { id: string },
  Column extends SearchColumn<Task>,
>(
  columns: readonly Column[],
  matches: ReadonlySet<string>,
  revealAll: boolean,
): Column[] {
  return revealAll ? [...columns] : searchColumns(columns, matches);
}

/** Сколько карточек колонки нашлось — счётчик «2 из 14» в заголовке. */
export function countMatches(
  tasks: readonly { id: string }[],
  matches: ReadonlySet<string>,
): number {
  return tasks.reduce((sum, task) => sum + (matches.has(task.id) ? 1 : 0), 0);
}

/**
 * Свёрнута ли колонка на телефоне. Пока идёт поиск, колонка с находками
 * раскрыта всегда: свёрнутая прятала бы найденное под заголовком (так кнопка
 * «Показать все» и выглядела нерабочей в первый раз). Остальные — как их
 * оставил человек.
 */
export function isColumnFolded(params: {
  collapsed: readonly string[];
  columnId: string;
  searchActive: boolean;
  hasMatches: boolean;
}): boolean {
  if (!params.collapsed.includes(params.columnId)) return false;
  return !(params.searchActive && params.hasMatches);
}

/** Подпись кнопки-переключателя под полем поиска. */
export function searchToggleLabel(revealAll: boolean): string {
  return revealAll ? "Только найденные" : "Показать все";
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
