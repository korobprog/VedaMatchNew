/**
 * Где искать колонку новой задачи (VED-73).
 *
 * Колонка указана — ищем её, и только на этой доске. Не указана — первая по
 * порядку колонка доски. Раньше запрос строился как `{ id: columnId,
 * boardId }`, и без колонки Prisma молча отбрасывала `id: undefined`: от
 * запроса оставалось «любая колонка доски» без сортировки, и задача,
 * заведённая через MCP без колонки, ложилась куда попало — VED-72 уехала во
 * «Вдохновение» вместо «Тестерования».
 */
export function newTaskColumnQuery(boardId: string, columnId: unknown) {
  const id =
    typeof columnId === 'string' && columnId.trim() ? columnId.trim() : null;
  return {
    where: id ? { id, boardId } : { boardId },
    orderBy: { position: 'asc' as const },
    select: { id: true, isDone: true },
  };
}
