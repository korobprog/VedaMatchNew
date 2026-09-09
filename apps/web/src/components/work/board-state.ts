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

/**
 * Соседи колонки на новом месте, когда её двигают на шаг: `-1` — раньше,
 * `+1` — позже. `null`, когда двигать некуда, — колонка уже с краю.
 *
 * Считается по списку БЕЗ самой колонки: ровно так её видит сервер, который
 * ставит колонку между названными соседями. Считать по списку с ней внутри
 * значит промахнуться на единицу и вернуть колонку туда, откуда взяли.
 */
export function columnNeighbours(
  columns: Array<{ id: string }>,
  columnId: string,
  direction: -1 | 1,
): { afterColumnId: string | null; beforeColumnId: string | null } | null {
  const index = columns.findIndex((column) => column.id === columnId);
  if (index === -1) return null;
  const target = index + direction;
  if (target < 0 || target >= columns.length) return null;

  const rest = columns.filter((column) => column.id !== columnId);
  return {
    afterColumnId: rest[target - 1]?.id ?? null,
    beforeColumnId: rest[target]?.id ?? null,
  };
}

/**
 * Похоже ли название колонки на завершающую.
 *
 * Нужно не для того, чтобы решать за человека, а чтобы вовремя спросить.
 * Задачу закрывает не название, а признак колонки: без него карточки в
 * «Выполнено» остаются открытыми и висят в счётчике среды. Признак живёт
 * галочкой в шапке, и о нём никто не догадывается — пока доска молчит.
 *
 * Список короткий и намеренно грубый: это повод показать подсказку, а не
 * приговор. Ошибиться в сторону лишнего вопроса дешевле, чем в сторону
 * счётчика, который врёт месяцами.
 */
export function looksDone(name: string): boolean {
  return /готов|выполн|заверш|сделан|закрыт|\bdone\b|\bcomplete/i.test(name);
}

/** Колонка переполнена: подсветка, а не запрет — запрет злит, подсветка работает. */
export function isOverWip(column: {
  wipLimit: number;
  tasks: unknown[];
}): boolean {
  return column.wipLimit > 0 && column.tasks.length > column.wipLimit;
}
