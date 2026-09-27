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
  /**
   * Отмечена ли к публикации (VED-302). Файл сначала смотрят во весь экран
   * кликом по картинке, а берут — рамочкой в углу; поэтому добавленный файл
   * ещё не выбран, и кнопка шлёт только отмеченные.
   */
  selected: boolean;
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
      selected: false,
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

/**
 * Можно ли отметить файл: ждущий или упавший на сервере. Отвергнутый на входе
 * и уже опубликованный отмечать незачем — отправлять нечего.
 */
export function pictureSelectable(item: PictureItem): boolean {
  return (
    item.status === "waiting" || (item.status === "error" && item.retriable)
  );
}

/** Клик по рамочке: отметить или снять отметку. Неподходящий не трогаем. */
export function togglePictureSelected(
  queue: readonly PictureItem[],
  id: string,
): PictureItem[] {
  return queue.map((item) =>
    item.id === id && pictureSelectable(item)
      ? { ...item, selected: !item.selected }
      : item,
  );
}

/** «Выбрать все» / «Снять выбор» — для пачки из тридцати открыток. */
export function setAllPicturesSelected(
  queue: readonly PictureItem[],
  selected: boolean,
): PictureItem[] {
  return queue.map((item) =>
    pictureSelectable(item) ? { ...item, selected } : item,
  );
}

/** Что уйдёт по кнопке: отмеченные ждущие и упавшие на сервере. */
export function picturesToSend(queue: readonly PictureItem[]): PictureItem[] {
  return queue.filter((item) => item.selected && pictureSelectable(item));
}

/**
 * Соседняя картинка при листании просмотра стрелками — по кругу, чтобы с
 * последней можно было вернуться к первой.
 */
export function stepPreview(index: number, delta: number, length: number) {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

/** «Опубликовано 3 из 4, не загрузилось: 1» — итог после отправки. */
export function pictureSummary(queue: readonly PictureItem[]): string | null {
  const done = queue.filter((item) => item.status === "done").length;
  const failed = queue.filter((item) => item.status === "error").length;
  if (done === 0 && failed === 0) return null;
  // Неотмеченные ждущие в итог не входят: их и не собирались публиковать.
  const total = queue.filter(
    (item) => item.selected || item.status !== "waiting",
  ).length;
  const head = `Опубликовано ${done} из ${total}`;
  if (failed === 0) return head;
  return `${head}, не загрузилось: ${failed}`;
}
