/**
 * Очередь загрузок «Работы» (VED-608): создание задачи и вложения к ней живут
 * вне окна задачи и вне доски.
 *
 * Раньше загрузка шла из компонента: форма новой задачи держала кнопку
 * «Добавляем…», пока по одному уходили скриншоты, а окно задачи — «Загружаю
 * 2 из 5». Сами запросы при уходе в другое окно портала не отменялись, но
 * всё, что должно было случиться после них, было привязано к смонтированной
 * доске: черновик формы не снимался и при возврате вставал на место, будто
 * задача не ушла; ошибка про не приложившийся файл не показывалась никому.
 * Человек ждал на странице, чтобы «добавление не сорвалось».
 *
 * Здесь — чистая логика без React и без браузера: зависимости (запросы,
 * ужатие картинки, ожидание видимости вкладки) передаются снаружи, поэтому
 * очередь покрыта тестами целиком. Живой экземпляр — `work-uploads.ts`,
 * индикатор — `upload-indicator.tsx` в корневом layout.
 */

import {
  MAX_FILES_AT_ONCE,
  uploadInTurn,
  uploadProblemMessage,
  type UploadInTurnResult,
} from "./attach-files";

export type WorkUploadPhase = "creating" | "uploading" | "done" | "failed";

export interface WorkUploadJob {
  id: string;
  boardId: string;
  /** Куда вести из уведомления: доска с открытой задачей. */
  href: string | null;
  /** `null`, пока задача создаётся. */
  taskKey: string | null;
  taskId: string | null;
  title: string;
  /** Сколько файлов уходит (не больше `MAX_FILES_AT_ONCE`). */
  total: number;
  /** Сколько уже ушло — удачно или нет. */
  done: number;
  phase: WorkUploadPhase;
  /** Что сказать человеку, если приложилось не всё или задача не создалась. */
  problem: string | null;
}

export interface WorkTaskRef {
  id: string;
  key: string;
}

export interface WorkUploadDeps<TTask extends WorkTaskRef, TBody> {
  createTask: (boardId: string, body: TBody) => Promise<TTask>;
  attach: (taskId: string, file: File) => Promise<TTask>;
  /** Подготовка файла перед отправкой (ужатие картинки); не должна падать. */
  prepare?: (file: File) => Promise<File>;
  /**
   * Перед повтором после обрыва сети: ждать, пока вкладка снова на экране.
   * Телефон, свёрнутый посреди загрузки, может оборвать соединение — тогда
   * файл уходит повторно, когда человек вернулся.
   */
  waitBeforeRetry?: () => Promise<void>;
  newId?: () => string;
}

/**
 * Кто следит за задачей сам. Если к концу загрузки наблюдатель на месте
 * (доска или окно задачи ещё открыты), он сам покажет итог — уведомление не
 * нужно, и задание тихо уходит из списка. Если ушёл — итог остаётся в списке,
 * и индикатор портала сообщает о нём.
 */
export interface WorkUploadWatcher {
  watching: () => boolean;
}

export interface CreateWithFilesInput<TBody, TTask extends WorkTaskRef> {
  boardId: string;
  body: TBody;
  title: string;
  files: readonly File[];
  /** Адрес доски; к нему добавится `?task=<ключ>`. */
  boardHref?: string;
  watcher?: WorkUploadWatcher;
  /** Задача заведена — вызывается и без смонтированной доски. */
  onCreated?: (task: TTask) => void;
  /**
   * Файлы ушли (удачно или нет) — вызывается и без смонтированной доски, до
   * решения, показывать ли уведомление. Без файлов не вызывается.
   */
  onFilesDone?: (task: TTask, outcome: AttachOutcome<TTask>) => void;
}

export interface AttachInput {
  boardId: string;
  taskId: string;
  taskKey: string;
  title: string;
  files: readonly File[];
  boardHref?: string;
  watcher?: WorkUploadWatcher;
}

export interface AttachOutcome<TTask> {
  /** Ответ последней удачной загрузки — карточка со всеми вложениями. */
  last: TTask | undefined;
  /** `null` — приложилось всё. */
  problem: string | null;
}

/** Обрыв сети, а не ответ сервера: у такой ошибки статус 0. */
export function isNetworkFailure(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "status" in cause &&
    (cause as { status: unknown }).status === 0
  );
}

/** Сколько раз переотправлять файл после обрыва сети. */
export const NETWORK_RETRIES = 2;

/** Ссылка на задачу в уведомлении: доска с `?task=VED-12`. */
export function taskHref(
  boardHref: string | undefined,
  key: string,
): string | null {
  if (!boardHref) return null;
  const glue = boardHref.includes("?") ? "&" : "?";
  return `${boardHref}${glue}task=${encodeURIComponent(key)}`;
}

/** Подпись индикатора: что сейчас происходит с заданием. */
export function describeUploadJob(job: WorkUploadJob): string {
  const named = job.taskKey ?? `«${job.title}»`;
  const where = `задачу ${named}`;
  switch (job.phase) {
    case "creating":
      return job.total > 0
        ? `Создаём задачу «${job.title}», потом загрузим ${filesWord(job.total)}`
        : `Создаём задачу «${job.title}»`;
    case "uploading":
      return job.total > 1
        ? `Загружаем ${filesWord(job.total)} в ${where}: ${Math.min(job.done + 1, job.total)} из ${job.total}`
        : `Загружаем файл в ${where}`;
    case "done":
      if (job.problem) return `Задача ${named}: ${job.problem}`;
      return job.total > 0
        ? `Загружено ${filesWord(job.total)} в ${where}`
        : `Задача ${named} добавлена`;
    case "failed":
      return `Задача «${job.title}» не добавлена: ${job.problem ?? "не получилось"}`;
  }
}

/** «1 файл», «2 файла», «5 файлов». */
export function filesWord(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  const word =
    tens >= 11 && tens <= 14
      ? "файлов"
      : ones === 1
        ? "файл"
        : ones >= 2 && ones <= 4
          ? "файла"
          : "файлов";
  return `${count} ${word}`;
}

export interface WorkUploadQueue<TTask extends WorkTaskRef, TBody> {
  /**
   * Завести задачу и отправить к ней файлы. Промис — про саму задачу: он
   * разрешается, как только она заведена (файлы продолжают уходить), и
   * отклоняется, если завести не вышло.
   */
  createWithFiles(input: CreateWithFilesInput<TBody, TTask>): Promise<TTask>;
  /** Приложить файлы к существующей задаче; промис — когда ушли все. */
  attach(input: AttachInput): Promise<AttachOutcome<TTask>>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly WorkUploadJob[];
  /** Идёт ли что-нибудь прямо сейчас (создание или загрузка). */
  isBusy(): boolean;
  dismiss(jobId: string): void;
}

export function createWorkUploadQueue<TTask extends WorkTaskRef, TBody>(
  deps: WorkUploadDeps<TTask, TBody>,
): WorkUploadQueue<TTask, TBody> {
  let jobs: readonly WorkUploadJob[] = [];
  const listeners = new Set<() => void>();
  let counter = 0;
  const newId = deps.newId ?? (() => `upload-${++counter}`);

  function emit() {
    for (const listener of [...listeners]) listener();
  }

  function put(job: WorkUploadJob) {
    jobs = [...jobs, job];
    emit();
  }

  function patch(id: string, next: Partial<WorkUploadJob>) {
    jobs = jobs.map((job) => (job.id === id ? { ...job, ...next } : job));
    emit();
  }

  function remove(id: string) {
    const before = jobs.length;
    jobs = jobs.filter((job) => job.id !== id);
    if (jobs.length !== before) emit();
  }

  /** Итог задания: наблюдатель на месте — тихо убрать, нет — оставить уведомлением. */
  function settle(
    id: string,
    next: Partial<WorkUploadJob>,
    watcher: WorkUploadWatcher | undefined,
  ) {
    if (watcher?.watching()) remove(id);
    else patch(id, next);
  }

  /** Отправка файла с повтором после обрыва сети. */
  async function attachWithRetry(taskId: string, file: File): Promise<TTask> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await deps.attach(taskId, file);
      } catch (cause) {
        if (!isNetworkFailure(cause) || attempt >= NETWORK_RETRIES) throw cause;
        await deps.waitBeforeRetry?.();
      }
    }
  }

  async function sendFiles(
    id: string,
    taskId: string,
    files: readonly File[],
  ): Promise<UploadInTurnResult<TTask>> {
    return uploadInTurn(
      files,
      (file) => attachWithRetry(taskId, file),
      (done, total) => patch(id, { done, total }),
      deps.prepare,
    );
  }

  return {
    async createWithFiles(input) {
      const id = newId();
      const total = Math.min(input.files.length, MAX_FILES_AT_ONCE);
      put({
        id,
        boardId: input.boardId,
        href: null,
        taskKey: null,
        taskId: null,
        title: input.title,
        total,
        done: 0,
        phase: "creating",
        problem: null,
      });
      let task: TTask;
      try {
        task = await deps.createTask(input.boardId, input.body);
      } catch (cause) {
        settle(
          id,
          {
            phase: "failed",
            problem: cause instanceof Error ? cause.message : "не получилось",
          },
          input.watcher,
        );
        throw cause;
      }
      input.onCreated?.(task);
      const href = taskHref(input.boardHref, task.key);
      if (input.files.length === 0) {
        // Без файлов уведомлять не о чем, кроме случая, когда человек ушёл
        // с доски, пока задача заводилась.
        settle(
          id,
          { phase: "done", taskId: task.id, taskKey: task.key, href },
          input.watcher,
        );
        return task;
      }
      patch(id, {
        phase: "uploading",
        taskId: task.id,
        taskKey: task.key,
        href,
      });
      void sendFiles(id, task.id, input.files).then((result) => {
        const problem = uploadProblemMessage(result);
        input.onFilesDone?.(task, { last: result.last, problem });
        settle(id, { phase: "done", done: total, problem }, input.watcher);
      });
      return task;
    },

    async attach(input) {
      const id = newId();
      put({
        id,
        boardId: input.boardId,
        href: taskHref(input.boardHref, input.taskKey),
        taskKey: input.taskKey,
        taskId: input.taskId,
        title: input.title,
        total: Math.min(input.files.length, MAX_FILES_AT_ONCE),
        done: 0,
        phase: "uploading",
        problem: null,
      });
      const result = await sendFiles(id, input.taskId, input.files);
      const problem = uploadProblemMessage(result);
      settle(id, { phase: "done", problem }, input.watcher);
      return { last: result.last, problem };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return jobs;
    },

    isBusy() {
      return jobs.some(
        (job) => job.phase === "creating" || job.phase === "uploading",
      );
    },

    dismiss(jobId) {
      remove(jobId);
    },
  };
}
