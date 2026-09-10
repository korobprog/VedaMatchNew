/**
 * Картинка из буфера обмена.
 *
 * Свой кадр раньше можно было только выбрать файлом. Но чаще всего картинку
 * копируют: из переписки, из галереи, из чужого поста — и «найдите её в
 * файлах» на телефоне означает выйти из мастера и вернуться, потеряв
 * набранное.
 *
 * Правила те же, что у сервера (`apps/api/src/modules/motivation/reel-image.ts`):
 * JPEG, PNG или WebP до 12 МБ. Повторены здесь намеренно — это другое
 * приложение, тянуть серверный модуль на веб нельзя, — но расходиться им
 * нельзя тоже: отказ уже после отправки человек читает как «портал сломался».
 */

export const REEL_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const REEL_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isReelImageType(type: string | null | undefined): boolean {
  return (
    typeof type === "string" &&
    (REEL_IMAGE_MIME as readonly string[]).includes(type.toLowerCase())
  );
}

/**
 * Первый подходящий файл из вставки. Буфер отдаёт и картинку, и её текстовое
 * представление, а иногда несколько кадров разом — берём первый, который
 * сервер примет.
 */
export function pickPastedImage(
  files: ArrayLike<File> | null | undefined,
): File | null {
  if (!files) return null;
  for (const file of Array.from(files)) {
    if (isReelImageType(file.type)) return file;
  }
  return null;
}

/**
 * Какой тип забрать у `ClipboardItem`. Один и тот же снимок лежит в буфере
 * сразу в нескольких видах; порядок наш, а не браузера.
 */
export function pickClipboardType(
  types: readonly string[] | null | undefined,
): string | null {
  if (!types) return null;
  for (const wanted of REEL_IMAGE_MIME) {
    const hit = types.find((type) => type.toLowerCase() === wanted);
    if (hit) return hit;
  }
  return null;
}

/**
 * Имя вставленному кадру. У картинки из буфера имени нет вовсе, а серверу и
 * человеку в списке нужно хоть что-то различимое — отсюда отметка времени.
 * Только латиница и цифры: имя уезжает в multipart, и кириллица там
 * превращается в набор знаков.
 */
export function pastedImageName(mime: string, at: Date): string {
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `vstavka-${stamp}.${EXTENSIONS[mime.toLowerCase()] ?? "png"}`;
}

/**
 * `null` — кадр можно отправлять. Иначе строка, которую показываем человеку:
 * коды наружу не выносим, как и на сервере.
 */
export function pastedImageRejection(
  file: { type: string; size: number } | null,
): string | null {
  if (!file) return "В буфере нет картинки — скопируйте её и попробуйте снова";
  if (!isReelImageType(file.type)) return "Подойдёт JPEG, PNG или WebP";
  if (file.size > REEL_IMAGE_MAX_BYTES)
    return `Картинка больше ${Math.round(REEL_IMAGE_MAX_BYTES / (1024 * 1024))} МБ — уменьшите её`;
  return null;
}

/** Размер словами: «2,4 МБ» понятнее, чем 2516582. */
export function formatImageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}
