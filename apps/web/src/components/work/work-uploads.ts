import type { CreateWorkTaskRequest, WorkTaskDto } from "@vedamatch/shared";
import { attachWorkFile, createWorkTask } from "@/lib/work-api";
import { shrinkImageForUpload } from "./attach-image-canvas";
import { createWorkUploadQueue, type WorkUploadQueue } from "./upload-queue";

/**
 * Живая очередь загрузок «Работы» (VED-608) — один экземпляр на вкладку, вне
 * React: переход между окнами портала размонтирует доску и окно задачи, а
 * модуль остаётся. Логика — в `upload-queue.ts`.
 *
 * Сами запросы мы не отменяем ни при уходе со страницы, ни при сворачивании
 * вкладки (`visibilitychange`, `pagehide`): у них нет AbortSignal. `keepalive`
 * не используем — у него лимит 64 КБ на тело, скриншот в него не влезет.
 */
export const workUploads: WorkUploadQueue<WorkTaskDto, CreateWorkTaskRequest> =
  createWorkUploadQueue<WorkTaskDto, CreateWorkTaskRequest>({
    // Обёртки, а не сами функции: запрос берётся в момент вызова.
    createTask: (boardId, body) => createWorkTask(boardId, body),
    attach: (taskId, file) => attachWorkFile(taskId, file),
    prepare: shrinkImageForUpload,
    waitBeforeRetry: whenVisible,
  });

/**
 * Разрешается, когда вкладка снова на экране и есть связь: файл переотправляют
 * после возвращения, а не в пустоту при выключенном интернете — два повтора
 * израсходовались бы сразу.
 */
function whenVisible(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const ready = () =>
    document.visibilityState === "visible" && navigator.onLine !== false;
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (!ready()) return;
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("online", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("online", onChange);
  });
}
