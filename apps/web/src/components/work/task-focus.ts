/**
 * Какую задачу открыть сразу при заходе на доску.
 *
 * Уведомления «Работ» вели на саму доску: человеку писали «VED-42: новый
 * комментарий», он нажимал — и попадал в начало списка, где эту задачу ещё
 * надо найти глазами среди полусотни чужих. Новость называет задачу, значит
 * и открывать надо её.
 *
 * Адресуем по ключу (`VED-42`), а не по внутреннему идентификатору: ключ уже
 * лежит в событии уведомления, он же написан на карточке, и такой ссылкой
 * можно поделиться словами — «посмотри VED-42».
 */

/** Ключ задачи: префикс среды, дефис, номер. */
const TASK_KEY = /^[A-Za-z][A-Za-z0-9]{0,15}-\d{1,9}$/;

export interface FocusableTask {
  id: string;
  key: string;
}

export interface FocusableBoard {
  columns: readonly { id: string; tasks: readonly FocusableTask[] }[];
}

export interface FocusedTask {
  taskId: string;
  columnId: string;
}

/**
 * Ключ из строки запроса или `null`. Мусор отбрасываем молча: доска обязана
 * открыться, даже если ссылку кто-то поправил руками.
 */
export function parseFocusKey(
  search: string | null | undefined,
): string | null {
  if (!search) return null;
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("task");
  const key = raw?.trim().toUpperCase();
  return key && TASK_KEY.test(key) ? key : null;
}

/**
 * Ищет задачу по ключу на уже загруженной доске. Отдельного запроса не надо:
 * доска и так приходит целиком.
 *
 * `null` — задачи здесь нет: её перенесли в другую среду, заархивировали или
 * ключ в ссылке чужой. Молчим и просто показываем доску.
 */
export function findTaskByKey(
  board: FocusableBoard | null | undefined,
  key: string | null,
): FocusedTask | null {
  if (!board || !key) return null;
  const wanted = key.trim().toUpperCase();
  for (const column of board.columns) {
    for (const task of column.tasks) {
      if (task.key.toUpperCase() === wanted)
        return { taskId: task.id, columnId: column.id };
    }
  }
  return null;
}
