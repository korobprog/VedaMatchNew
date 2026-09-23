import type {
  NotificationMark,
  WorkBoardDto,
  WorkTaskCardDto,
} from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * «Чужие» задачи на доске (VED-320) и отметка «Просмотрено» (VED-365).
 *
 * Заказчик: задачи, которые «составил другой админ и он же исполнитель», не
 * должны стоять у меня «Тестированием» — это не моя работа. Статус у них
 * «Чужое», тёмно-синий, «и вообще их лучше спрятать в какую-то отдельную
 * папку, раздел, чтобы их не было видно по умолчанию, и чтобы их можно было
 * увидеть, зайдя туда».
 *
 * Чья задача, решает сервер (`WorkTaskCardDto.foreign`, для смотрящего), —
 * здесь только что показать. Чистые функции без DOM: ошибка в них выглядит
 * как «карточка пропала» или «легла не туда», и ловить это тестом дешевле.
 */

/** Какая «папка» доски открыта: свои задачи (по умолчанию) или чужие. */
export type WorkTaskFolder = "mine" | "foreign";

/**
 * Ярлык на карточке: у чужой — «Чужое» вместо состояния, у своей — состояние.
 * Автор и исполнитель той же задачи видят её настоящий статус.
 */
export function taskMark(
  task: Pick<WorkTaskCardDto, "foreign" | "statusMark">,
): NotificationMark | null {
  return task.foreign ? "foreign" : task.statusMark;
}

/** Сколько чужих задач на доске — число на кнопке «Чужие». */
export function countForeign(
  columns: ReadonlyArray<{ tasks: ReadonlyArray<{ foreign: boolean }> }>,
): number {
  return columns.reduce(
    (sum, column) => sum + column.tasks.filter((task) => task.foreign).length,
    0,
  );
}

/**
 * Колонки для открытой «папки».
 *
 * Свои — все колонки, с одними своими карточками: колонка остаётся, даже
 * если своих в ней нет, — это рабочее место, в неё переносят и в ней заводят.
 * Чужие — только колонки, где чужое есть: это просмотр, десяток пустых
 * заголовков отодвигал бы нужное за экран.
 */
export function folderColumns<
  Column extends { tasks: ReadonlyArray<{ foreign: boolean }> },
>(columns: readonly Column[], folder: WorkTaskFolder): Column[] {
  const wantForeign = folder === "foreign";
  const filtered = columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => task.foreign === wantForeign),
  }));
  return wantForeign
    ? filtered.filter((column) => column.tasks.length > 0)
    : filtered;
}

/**
 * Место на доске по месту среди видимых карточек.
 *
 * Перетаскивание считает щель между тем, что нарисовано, а перенос ставит
 * карточку по индексу во всей колонке, где лежат и спрятанные чужие. Без
 * перевода карточка вставала бы выше или ниже того места, куда её опустили,
 * — ровно на столько, сколько чужих спрятано выше.
 *
 * Индекс — в колонке без самой переносимой карточки: так его понимает
 * `moveTaskLocally`. Опустили ниже последней видимой — встаёт сразу за ней, а
 * не в самый низ под спрятанными: соседи у неё те, кого видно.
 */
export function boardDropIndex<Task extends { id: string }>(
  columnTasks: readonly Task[],
  isShown: (task: Task) => boolean,
  draggedId: string,
  shownIndex: number,
): number {
  const without = columnTasks.filter((task) => task.id !== draggedId);
  const shown = without.filter(isShown);
  if (shown.length === 0) return 0;
  const anchor = shown[Math.min(shownIndex, shown.length - 1)];
  const at = without.indexOf(anchor);
  return shownIndex < shown.length ? at : at + 1;
}

/** Подпись у кнопки «Чужие»: что в папке и почему её не видно. */
export function foreignFolderHint(
  count: number,
  folder: WorkTaskFolder,
): string {
  const tasks = plural(count, "задача", "задачи", "задач");
  return folder === "foreign"
    ? `Показаны только чужие: ${count} ${tasks}. Их составил и ведёт другой участник`
    : `${count} ${tasks} ${plural(count, "скрыта", "скрыты", "скрыто")}: их составил и ведёт другой участник`;
}

/** «Просмотрено» на месте, не дожидаясь сервера (VED-365). */
export function setTaskViewedLocally(
  board: WorkBoardDto,
  taskId: string,
  viewed: boolean,
): WorkBoardDto {
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.tasks.some((task) => task.id === taskId)
        ? {
            ...column,
            tasks: column.tasks.map((task) =>
              task.id === taskId ? { ...task, viewed } : task,
            ),
          }
        : column,
    ),
  };
}
