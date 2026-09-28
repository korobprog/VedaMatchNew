/**
 * Новые пункты чек-листа уходят очередью вне окна задачи (VED-624).
 *
 * Заказчик: «Я нажал на загрузить скриншот, а потом написал ещё один пункт в
 * чек-листе и вышел из окна этой задачи. Позже выяснилось, что новый пункт не
 * сохранился. Надо, чтобы ничего не терялось, всё сохранилось при любых
 * обстоятельствах».
 *
 * Раньше пункт уходил через общую обёртку действий окна: поле очищалось
 * только после ответа сервера, всё, что должно было случиться после
 * запроса, было привязано к смонтированному окну, а текст, набранный, но не
 * отправленный, пропадал вместе с окном. Теперь пункт встаёт в очередь в
 * момент нажатия — независимо от загрузок и других действий окна, — и
 * закрытие окна его не отменяет (как раздел и статус, `task-place.ts`).
 * Живой экземпляр шлёт запросы с `keepalive`: их доносит и закрытие вкладки.
 *
 * Пункты одной задачи уходят по очереди — в том порядке, в каком их
 * добавили. Здесь — чистая логика без React и без браузера.
 */

export interface ChecklistQueueDeps<T> {
  add: (taskId: string, text: string) => Promise<T>;
  newId?: () => string;
}

/** Пункт, который ещё летит на сервер. */
export interface PendingChecklistItem {
  id: string;
  text: string;
}

export interface ChecklistAddOutcome<T> {
  taskId: string;
  text: string;
  /** Карточка после запроса; `null` — пункт не дошёл. */
  task: T | null;
  /** Что сказать человеку, если пункт не сохранился; `null` — дошёл. */
  problem: string | null;
}

export type PendingChecklist = Readonly<
  Record<string, readonly PendingChecklistItem[]>
>;

export interface ChecklistQueue<T> {
  /** Поставить пункт в очередь задачи. Пустой текст не отправляется. */
  add(taskId: string, text: string): Promise<ChecklistAddOutcome<T>>;
  /** Сколько пунктов по задаче уже ушло (удачно или нет) с начала работы. */
  settled(taskId: string): number;
  subscribe(listener: () => void): () => void;
  /** Что ещё летит, по id задачи. Новый объект — только при изменении. */
  getSnapshot(): PendingChecklist;
}

const NOTHING: readonly PendingChecklistItem[] = [];

/** Пункты задачи, которые ещё летят. */
export function pendingItems(
  snapshot: PendingChecklist,
  taskId: string,
): readonly PendingChecklistItem[] {
  return snapshot[taskId] ?? NOTHING;
}

function problemOf(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Не сохранилось";
}

/**
 * Недописанный текст и пункт, который не дошёл, — в одно поле: сначала то,
 * что не дошло (его писали раньше), потом набранное после.
 */
export function joinChecklistText(failed: string, current: string): string {
  const head = failed.trim();
  const tail = current.trim();
  if (!head) return current;
  return tail ? `${head}\n${current}` : head;
}

export function createChecklistQueue<T>(
  deps: ChecklistQueueDeps<T>,
): ChecklistQueue<T> {
  let counter = 0;
  const newId = deps.newId ?? (() => `pending-${++counter}`);
  const tails = new Map<string, Promise<unknown>>();
  const settledCount = new Map<string, number>();
  const listeners = new Set<() => void>();
  let snapshot: PendingChecklist = {};

  function publish(taskId: string, items: readonly PendingChecklistItem[]) {
    const next = { ...snapshot };
    if (items.length > 0) next[taskId] = items;
    else delete next[taskId];
    snapshot = next;
    for (const listener of listeners) listener();
  }

  return {
    add(taskId, text) {
      const trimmed = text.trim();
      if (!trimmed) {
        return Promise.resolve({
          taskId,
          text: trimmed,
          task: null,
          problem: null,
        });
      }
      const item = { id: newId(), text: trimmed };
      publish(taskId, [...pendingItems(snapshot, taskId), item]);

      const tail = tails.get(taskId) ?? Promise.resolve();
      const result = tail.then(async (): Promise<ChecklistAddOutcome<T>> => {
        let task: T | null = null;
        let problem: string | null = null;
        try {
          task = await deps.add(taskId, trimmed);
        } catch (cause) {
          problem = problemOf(cause);
        }
        settledCount.set(taskId, (settledCount.get(taskId) ?? 0) + 1);
        publish(
          taskId,
          pendingItems(snapshot, taskId).filter((one) => one.id !== item.id),
        );
        return { taskId, text: trimmed, task, problem };
      });
      tails.set(taskId, result);
      void result.then(() => {
        if (tails.get(taskId) === result) tails.delete(taskId);
      });
      return result;
    },
    settled(taskId) {
      return settledCount.get(taskId) ?? 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
