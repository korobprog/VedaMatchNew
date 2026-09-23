import type {
  UpdateWorkTaskRequest,
  WorkTaskDto,
  WorkTaskPriority,
} from "@vedamatch/shared";
import { dueFromInput, dueToInput } from "./task-due";
import { normalizeTaskTitle, titleToSave } from "./task-title";

/**
 * Правки в окне задачи копятся черновиком и уходят кнопкой «Сохранить»
 * (VED-56).
 *
 * Сначала черновиком жили только название и описание: раньше они сохранялись
 * сами при потере фокуса, человек не видел, дошло ли, а Escape прямо из поля
 * правку терял. Остальные поля — раздел, исполнитель, важность, срок —
 * по-прежнему уходили на сервер в момент выбора, и кнопка после них не
 * появлялась. Заказчик вернул карточку: «Сделай, чтобы кнопка сохранить
 * появлялась после любой правки. Сейчас не так». Теперь черновик — все поля
 * карточки, а сохраняет их кнопка или закрытие окна.
 *
 * Чек-лист, вложения и комментарии в черновик не входят: у каждого из них
 * своя кнопка действия («Добавить», «Отправить», выбор файла), и нажатие на
 * неё — уже решение. Про них окно говорит «Сохранено», чтобы и там было видно,
 * что дошло.
 */

export interface TaskDraft {
  title: string;
  description: string;
  /** Раздел доски: перенос из окна — та же правка, что и остальные. */
  columnId: string;
  assigneeId: string | null;
  priority: WorkTaskPriority;
  /**
   * Срок как его держит поле `datetime-local` — местное время без зоны,
   * «2026-09-07T23:59»; пусто — срока нет. Строкой, а не ISO: пока человек
   * печатает, поле проходит через недописанные значения, и черновик обязан их
   * хранить, чтобы не стирать написанное.
   */
  due: string;
}

/** Черновик по карточке — то, что лежит на доске сейчас. */
export function draftFromTask(
  task: Pick<
    WorkTaskDto,
    "title" | "description" | "columnId" | "assignee" | "priority" | "dueAt"
  >,
): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    columnId: task.columnId,
    assigneeId: task.assignee?.userId ?? null,
    priority: task.priority,
    due: dueToInput(task.dueAt),
  };
}

/** Есть ли несохранённые правки — от этого зависит, видна ли кнопка. */
export function hasTaskEdits(saved: TaskDraft, draft: TaskDraft): boolean {
  return (
    normalizeTaskTitle(draft.title) !== saved.title ||
    draft.description !== saved.description ||
    draft.columnId !== saved.columnId ||
    draft.assigneeId !== saved.assigneeId ||
    draft.priority !== saved.priority ||
    draft.due !== saved.due
  );
}

/**
 * Почему сохранить нельзя. Пустое название не сохраняется никогда: карточку
 * без названия не найти ни на доске, ни в поиске. Негодный срок — тоже:
 * строку, которую поле не смогло разобрать, сервер не поймёт, а угадывать
 * день за человека нельзя.
 */
export function taskEditsProblem(
  draft: Pick<TaskDraft, "title" | "due">,
): string | null {
  if (!normalizeTaskTitle(draft.title)) return "Название не может быть пустым";
  if (dueFromInput(draft.due) === undefined) return "Срок указан не полностью";
  return null;
}

export interface PendingTaskEdits {
  /** Поля карточки одним запросом; `null` — менять нечего. */
  update: UpdateWorkTaskRequest | null;
  /** Новый раздел; `null` — карточка остаётся, где была. */
  columnId: string | null;
}

/**
 * Что отправить на сервер; `null` — нечего. Перенос — отдельным полем: у него
 * свой маршрут, и именно он рождает уведомление о смене статуса.
 *
 * Негодное значение отбрасывается, остальное всё равно уходит: закрытие окна
 * не должно терять описание из-за стёртого названия или недописанного срока.
 */
export function pendingTaskEdits(
  saved: TaskDraft,
  draft: TaskDraft,
): PendingTaskEdits | null {
  const update: UpdateWorkTaskRequest = {};
  const title = titleToSave(draft.title, saved.title);
  if (title) update.title = title;
  if (draft.description !== saved.description) {
    update.description = draft.description;
  }
  if (draft.assigneeId !== saved.assigneeId) {
    update.assigneeId = draft.assigneeId;
  }
  if (draft.priority !== saved.priority) update.priority = draft.priority;
  if (draft.due !== saved.due) {
    const dueAt = dueFromInput(draft.due);
    if (dueAt !== undefined) update.dueAt = dueAt;
  }
  const columnId = draft.columnId !== saved.columnId ? draft.columnId : null;
  const hasUpdate = Object.keys(update).length > 0;
  if (!hasUpdate && !columnId) return null;
  return { update: hasUpdate ? update : null, columnId };
}
