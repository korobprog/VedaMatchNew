import { isStatusColumn } from './work-task-status';

/**
 * Раздел задачи отдельно от статуса (VED-430).
 *
 * Колонка у задачи одна, и в ней смешаны два смысла: раздел («РАБОТА»,
 * «МУЗЫКА») и статус («Тестерование», «Выполнено»). Уехав в «Тестерование»,
 * задача переставала говорить, о чём она. Поэтому раздел запоминается
 * отдельно (`WorkTask.sectionColumnId`), а колонка по-прежнему одна: на ней
 * держатся ярлык, уведомления о смене статуса и закрытие задачи, и ломать это
 * ради второго измерения незачем.
 *
 * Правило одно: пока задача в колонке раздела, её раздел — эта колонка; в
 * колонке статуса раздел остаётся тем, из которого она туда пришла. Здесь —
 * только решение, без базы: ошибка в нём выглядит как «задача потеряла
 * раздел», и ловить это тестом дешевле.
 */

/** Колонка так, как её видит правило: id и имя. */
export interface WorkSectionColumn {
  id: string;
  name: string;
}

/** Раздел только что заведённой задачи. */
export function sectionOnCreate(column: WorkSectionColumn): string | null {
  return isStatusColumn(column.name) ? null : column.id;
}

/**
 * Раздел после переноса.
 *
 * - В колонку раздела — раздел и есть она.
 * - В колонку статуса — раздел, явно выбранный в окне задачи (`requested`),
 *   иначе колонка, откуда уехали, если это раздел, иначе прежний раздел
 *   (статус → статус раздела не меняет).
 */
export function sectionOnMove(params: {
  from: WorkSectionColumn;
  to: WorkSectionColumn;
  currentSectionId: string | null;
  /** Выбран в окне вместе с переносом; `undefined` — не выбирали. */
  requestedSectionId?: string | null;
}): string | null {
  if (!isStatusColumn(params.to.name)) return params.to.id;
  if (params.requestedSectionId !== undefined) return params.requestedSectionId;
  if (!isStatusColumn(params.from.name)) return params.from.id;
  return params.currentSectionId;
}

/**
 * Раздел для карточки: у задачи в колонке раздела — сама колонка, даже если
 * в базе записано что-то другое (запись не успела за переносом старой сборки
 * или агента); у задачи в колонке статуса — запомненный раздел.
 */
export function cardSectionId(
  column: WorkSectionColumn,
  sectionColumnId: string | null,
): string | null {
  return isStatusColumn(column.name) ? sectionColumnId : column.id;
}

/** Почему этот раздел выбрать нельзя; `null` — можно. */
export function sectionChoiceProblem(
  column: WorkSectionColumn | null,
): string | null {
  if (!column) return 'Раздел не найден';
  if (isStatusColumn(column.name)) {
    return 'Это колонка статуса, а не раздел — выберите раздел';
  }
  return null;
}
