/**
 * Несколько вложений за раз (VED-112).
 *
 * Сервер принимает по файлу на запрос, поэтому выбранные файлы уходят по
 * очереди, а не пачкой разом: так карточка растёт на глазах, счётчик
 * «2 из 5» не врёт, а частотный лимит сервера (30 загрузок в минуту) не
 * срабатывает от одного выбора.
 */

/** Сколько файлов берём за один выбор: с запасом под лимит сервера. */
export const MAX_FILES_AT_ONCE = 10;

export interface FailedUpload {
  name: string;
  reason: string;
}

export interface UploadInTurnResult<T> {
  /** Ответ последней удачной загрузки — в нём карточка со всеми вложениями. */
  last: T | undefined;
  failed: FailedUpload[];
  /** Сколько файлов не взяли из-за `MAX_FILES_AT_ONCE`. */
  skipped: number;
}

/**
 * Загружает файлы по одному. Сбой одного файла не останавливает остальные:
 * из пяти скриншотов слишком большой один, а не все пять.
 */
export async function uploadInTurn<T>(
  files: readonly File[],
  upload: (file: File) => Promise<T>,
  onProgress?: (done: number, total: number) => void,
): Promise<UploadInTurnResult<T>> {
  const taken = files.slice(0, MAX_FILES_AT_ONCE);
  const failed: FailedUpload[] = [];
  let last: T | undefined;

  for (const [index, file] of taken.entries()) {
    onProgress?.(index, taken.length);
    try {
      last = await upload(file);
    } catch (cause) {
      failed.push({
        name: file.name,
        reason: cause instanceof Error ? cause.message : "не загрузился",
      });
    }
  }
  onProgress?.(taken.length, taken.length);

  return { last, failed, skipped: files.length - taken.length };
}

/**
 * Что сказать человеку, если приложилось не всё. `null` — всё приложилось.
 * Имя файла называем: иначе из пяти скриншотов не понять, какой переложить.
 */
export function uploadProblemMessage(
  result: Pick<UploadInTurnResult<unknown>, "failed" | "skipped">,
): string | null {
  const parts: string[] = [];
  for (const file of result.failed) {
    parts.push(`«${file.name}» не приложился: ${file.reason}`);
  }
  if (result.skipped > 0) {
    parts.push(
      `за раз прикрепляется не больше ${MAX_FILES_AT_ONCE} файлов — ещё ${result.skipped} выберите следующим заходом`,
    );
  }
  return parts.length ? parts.join("; ") : null;
}
