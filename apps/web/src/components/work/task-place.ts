import type {
  MoveWorkTaskRequest,
  UpdateWorkTaskRequest,
  WorkTaskDto,
} from "@vedamatch/shared";
import {
  draftFromTask,
  hasTaskEdits,
  pendingTaskEdits,
  type PendingTaskEdits,
  type TaskDraft,
} from "./task-edits";

/**
 * Раздел и статус задачи сохраняются сразу (VED-526, VED-611).
 *
 * VED-526 отправлял выбор тут же, но через общую обёртку действий окна: пока
 * запрос летел, место в черновике расходилось с карточкой — окно считало это
 * несохранённой правкой и показывало «Сохранить», а после ответа — полосу
 * «Сохранено» с той же кнопкой. Заказчик вернул карточку: «Сделай, чтобы после
 * изменения Статуса и Раздела задачи сразу же происходило автоматическое
 * сохранение, даже если админ вышел из этого окна и приложения. И не вылазила
 * кнопка „Сохранить“».
 *
 * Теперь место в черновик не входит вовсе: его показывает карточка,
 * оптимистично подменённая выбранным, а на сервер оно уходит очередью вне
 * React (`createTaskPlacer`), которую не отменяет ни закрытие окна, ни уход в
 * другое окно портала. Живой экземпляр шлёт запросы с `keepalive` — их
 * доносит и закрытие вкладки или приложения.
 *
 * Здесь — чистая логика без React и без браузера: запросы передаются снаружи.
 */

/** Место задачи на доске: колонка и раздел. */
export type TaskPlace = Pick<TaskDraft, "columnId" | "sectionId">;

/** Только место — без остальных полей, которые несёт черновик или карточка. */
export function placeOf(from: {
  columnId: string;
  sectionId?: string | null;
}): TaskPlace {
  return { columnId: from.columnId, sectionId: from.sectionId ?? null };
}

/** То же, но с другим местом. */
export function withPlace<T extends TaskPlace>(value: T, place: TaskPlace): T {
  return { ...value, columnId: place.columnId, sectionId: place.sectionId };
}

/**
 * Есть ли правки, которые ждут «Сохранить». Место не считается: оно уже ушло
 * само, и кнопка из-за него появляться не должна.
 */
export function hasFormEdits(saved: TaskDraft, draft: TaskDraft): boolean {
  return hasTaskEdits(saved, withPlace(draft, saved));
}

/** Что отправить кнопкой «Сохранить» или закрытием окна — всё, кроме места. */
export function pendingFormEdits(
  saved: TaskDraft,
  draft: TaskDraft,
): PendingTaskEdits | null {
  return pendingTaskEdits(saved, withPlace(draft, saved));
}

/** Что отправить при выборе места — только место, от сохранённой карточки. */
export function pendingPlaceEdits(
  saved: TaskDraft,
  place: TaskPlace,
): PendingTaskEdits | null {
  return pendingTaskEdits(saved, withPlace(saved, place));
}

type PlaceableTask = Pick<
  WorkTaskDto,
  | "id"
  | "title"
  | "description"
  | "columnId"
  | "sectionId"
  | "assignee"
  | "priority"
  | "dueAt"
>;

export interface TaskPlacerDeps<T extends PlaceableTask> {
  update: (taskId: string, body: UpdateWorkTaskRequest) => Promise<T>;
  move: (taskId: string, body: MoveWorkTaskRequest) => Promise<T>;
}

export interface PlaceOutcome<T> {
  /** Карточка, как её знает сервер после запроса (или до него, если не дошёл). */
  task: T;
  /** Что сказать человеку, если место не сохранилось; `null` — дошло. */
  problem: string | null;
  /**
   * Последний выбор по этой задаче: за ним в очереди никого. Только его итог
   * ставит карточку на место — промежуточный показал бы выбор, который уже
   * передумали.
   */
  last: boolean;
}

export interface TaskPlacer<T extends PlaceableTask> {
  /**
   * Отправить место. `confirmed` — карточка, как её знает сервер, без
   * оптимистичной подмены: от неё считается, что менять. Выборы по одной
   * задаче уходят по очереди, каждый — от итога предыдущего.
   */
  place(confirmed: T, place: TaskPlace): Promise<PlaceOutcome<T>>;
  /** Место, которое ещё летит на сервер; `undefined` — ничего не летит. */
  pendingPlace(taskId: string): TaskPlace | undefined;
}

function problemOf(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Не сохранилось";
}

export function createTaskPlacer<T extends PlaceableTask>(
  deps: TaskPlacerDeps<T>,
): TaskPlacer<T> {
  const queues = new Map<
    string,
    { tail: Promise<unknown>; queued: number; place: TaskPlace; confirmed?: T }
  >();

  return {
    place(confirmed, place) {
      const queue = queues.get(confirmed.id) ?? {
        tail: Promise.resolve(),
        queued: 0,
        place,
      };
      queue.queued += 1;
      queue.place = place;
      queues.set(confirmed.id, queue);

      const result = queue.tail.then(async (): Promise<PlaceOutcome<T>> => {
        const base = queue.confirmed ?? confirmed;
        let latest = base;
        let problem: string | null = null;
        try {
          const edits = pendingPlaceEdits(draftFromTask(base), place);
          if (edits?.update) {
            latest = await deps.update(base.id, edits.update);
          }
          if (edits?.columnId) {
            latest = await deps.move(base.id, {
              columnId: edits.columnId,
              // Раздел, выбранный вместе со статусом (VED-430), едет с
              // переносом.
              ...(edits.moveSectionId !== undefined
                ? { sectionColumnId: edits.moveSectionId }
                : {}),
            });
          }
        } catch (cause) {
          problem = problemOf(cause);
        }
        queue.confirmed = latest;
        queue.queued -= 1;
        const last = queue.queued === 0;
        if (last && queues.get(confirmed.id) === queue) {
          queues.delete(confirmed.id);
        }
        return { task: latest, problem, last };
      });
      queue.tail = result;
      return result;
    },
    pendingPlace(taskId) {
      return queues.get(taskId)?.place;
    },
  };
}
