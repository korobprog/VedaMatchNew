import type { WorkBoardDto, WorkTaskCardDto } from "@vedamatch/shared";

/**
 * Оптимистичный перенос карточки: доска перестраивается сразу, запрос уходит
 * следом. Ожидание ответа сервера под пальцем — главное, за что ругают
 * медленные доски, и лечится это только здесь.
 *
 * Чистая функция без DOM: ошибка в ней выглядит как «карточка прыгнула не
 * туда», и ловить такое глазами дороже, чем тестом.
 */
export function moveTaskLocally(
  board: WorkBoardDto,
  taskId: string,
  targetColumnId: string,
  index: number,
): WorkBoardDto {
  const task = board.columns
    .flatMap((column) => column.tasks)
    .find((card) => card.id === taskId);
  if (!task) return board;

  const target = board.columns.find((column) => column.id === targetColumnId);
  if (!target) return board;

  // Колонка «готово» закрывает задачу, выезд из неё — открывает обратно. Тот
  // же расчёт делает сервер; здесь он повторён, чтобы галочка не мигала.
  const moved: WorkTaskCardDto = {
    ...task,
    columnId: targetColumnId,
    completedAt: target.isDone
      ? (task.completedAt ?? new Date().toISOString())
      : null,
  };

  return {
    ...board,
    columns: board.columns.map((column) => {
      const without = column.tasks.filter((card) => card.id !== taskId);
      if (column.id !== targetColumnId) return { ...column, tasks: without };
      const at = Math.max(0, Math.min(index, without.length));
      return {
        ...column,
        tasks: [...without.slice(0, at), moved, ...without.slice(at)],
      };
    }),
  };
}

/** Соседи карточки на её новом месте — их и называет запрос переноса. */
export function neighboursOf(
  board: WorkBoardDto,
  taskId: string,
): { afterTaskId: string | null; beforeTaskId: string | null } {
  for (const column of board.columns) {
    const index = column.tasks.findIndex((card) => card.id === taskId);
    if (index === -1) continue;
    return {
      afterTaskId: column.tasks[index - 1]?.id ?? null,
      beforeTaskId: column.tasks[index + 1]?.id ?? null,
    };
  }
  return { afterTaskId: null, beforeTaskId: null };
}

/** Куда уедет карточка по кнопке «в соседнюю колонку»: клавиатурный путь. */
export function columnBeside(
  board: WorkBoardDto,
  columnId: string,
  direction: -1 | 1,
): string | null {
  const index = board.columns.findIndex((column) => column.id === columnId);
  if (index === -1) return null;
  return board.columns[index + direction]?.id ?? null;
}

/** Колонка переполнена: подсветка, а не запрет — запрет злит, подсветка работает. */
export function isOverWip(column: {
  wipLimit: number;
  tasks: unknown[];
}): boolean {
  return column.wipLimit > 0 && column.tasks.length > column.wipLimit;
}
