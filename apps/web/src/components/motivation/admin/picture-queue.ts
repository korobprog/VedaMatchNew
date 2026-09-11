import { pastedImageRejection } from "../clipboard-image";

/**
 * Очередь готовых картинок с афоризмами для загрузки в категорию (VED-87).
 *
 * Картинки обычно приносят пачкой — подборку открыток к празднику или
 * серию шлок, — поэтому форма принимает несколько файлов и отправляет их по
 * одному: один запрос на файл, и упавший файл не хоронит остальные.
 *
 * Чистый модуль: что принять, что отправлять и что сказать по итогам —
 * проверяется тестом, а не глазами на проде.
 */

export type PictureStatus = "waiting" | "uploading" | "done" | "error";

export interface PictureItem {
  id: string;
  file: File;
  /** Цитата с картинки текстом — для поиска и скринридера. Необязательна. */
  text: string;
  status: PictureStatus;
  message: string | null;
  /**
   * Можно ли отправить ещё раз. Файл, отвергнутый ещё на входе (не тот
   * формат, больше 12 МБ), от повтора лучше не станет.
   */
  retriable: boolean;
  /** Слаг опубликованного поста — для ссылки «Открыть». */
  slug: string | null;
}

/** Совпадает с сервером (`PICTURE_TEXT_MAX`): лишнее он всё равно отвергнет. */
export const PICTURE_TEXT_MAX = 600;
/** Больше за раз не выбирают, а очередь на полсотни строк не проверить глазами. */
export const PICTURE_BATCH_MAX = 30;

export function addPictures(
  queue: readonly PictureItem[],
  files: readonly File[],
  makeId: () => string,
): PictureItem[] {
  const room = Math.max(0, PICTURE_BATCH_MAX - queue.length);
  const added = files.slice(0, room).map((file): PictureItem => {
    const rejection = pastedImageRejection(file);
    return {
      id: makeId(),
      file,
      text: "",
      status: rejection ? "error" : "waiting",
      message: rejection,
      retriable: !rejection,
      slug: null,
    };
  });
  return [...queue, ...added];
}

export function updatePicture(
  queue: readonly PictureItem[],
  id: string,
  patch: Partial<Omit<PictureItem, "id" | "file">>,
): PictureItem[] {
  return queue.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function removePicture(
  queue: readonly PictureItem[],
  id: string,
): PictureItem[] {
  return queue.filter((item) => item.id !== id);
}

/** Что уйдёт по кнопке: ждущие и те, что упали на сервере. */
export function picturesToSend(queue: readonly PictureItem[]): PictureItem[] {
  return queue.filter(
    (item) =>
      item.status === "waiting" || (item.status === "error" && item.retriable),
  );
}

/** «Опубликовано 3 из 4, не загрузилось: 1» — итог после отправки. */
export function pictureSummary(queue: readonly PictureItem[]): string | null {
  const done = queue.filter((item) => item.status === "done").length;
  const failed = queue.filter((item) => item.status === "error").length;
  if (done === 0 && failed === 0) return null;
  const head = `Опубликовано ${done} из ${queue.length}`;
  if (failed === 0) return head;
  return `${head}, не загрузилось: ${failed}`;
}
