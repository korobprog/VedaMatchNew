/**
 * Несколько вложений за раз (VED-112).
 *
 * Сервер принимает по файлу на запрос, поэтому выбранные файлы уходят по
 * очереди, а не пачкой разом: так карточка растёт на глазах, счётчик
 * «2 из 5» не врёт, а частотный лимит сервера (30 загрузок в минуту) не
 * срабатывает от одного выбора.
 *
 * Разом их не шлём и ради скорости (VED-582): вложения в карточке идут в
 * порядке прихода на сервер, и серия скриншотов «шаг 1, шаг 2, шаг 3»
 * перемешалась бы; а ответ последней загрузки перестал бы быть карточкой со
 * всеми файлами. Ускоряет другое: картинка ужимается в браузере
 * (`prepare`), и следующий файл ужимается, пока уходит текущий.
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
 *
 * `prepare` — подготовка файла перед отправкой (ужатие картинки). Она
 * обязана не падать: при сбое возвращать исходный файл. Следующий файл
 * готовится, пока отправляется текущий.
 */
export async function uploadInTurn<T>(
  files: readonly File[],
  upload: (file: File) => Promise<T>,
  onProgress?: (done: number, total: number) => void,
  prepare: (file: File) => Promise<File> = async (file) => file,
): Promise<UploadInTurnResult<T>> {
  const taken = files.slice(0, MAX_FILES_AT_ONCE);
  const failed: FailedUpload[] = [];
  let last: T | undefined;
  const prepared: Promise<File>[] = [];
  const ready = (index: number) =>
    (prepared[index] ??= prepare(taken[index]).catch(() => taken[index]));

  for (const [index, file] of taken.entries()) {
    onProgress?.(index, taken.length);
    const body = await ready(index);
    if (index + 1 < taken.length) void ready(index + 1);
    try {
      last = await upload(body);
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
