/**
 * Проверка ролика в браузере до загрузки (VED-246). Те же пределы, что на
 * сервере (`video-upload.ts` в модуле motivation): отказ за секунду до
 * отправки лучше, чем после минуты загрузки пятидесяти мегабайт.
 *
 * Сервер всё равно проверяет сам — по содержимому файла; здесь только
 * быстрый отказ по типу, размеру и длительности.
 */

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 90;

/** Для `accept` у поля файла. */
export const VIDEO_ACCEPT =
  "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v";

const EXTENSIONS = /\.(mp4|m4v|webm|mov)$/i;
const TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
]);

/**
 * Тип — по `type`, а если браузер его не знает (так бывает с `.mov`), — по
 * расширению. `null` — годится.
 */
export function videoFileProblem(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!file.size) return "Файл пустой";
  const typed = file.type ? TYPES.has(file.type) : EXTENSIONS.test(file.name);
  if (!typed) return "Нужен видеофайл: mp4, webm или mov";
  if (file.size > VIDEO_MAX_BYTES)
    return "Файл больше 50 МБ — сожмите ролик или возьмите короче";
  return null;
}

/**
 * Длительность из метаданных ролика. `NaN`/`Infinity` (браузер не смог её
 * прочитать) — не отказ: сервер у mp4 и mov прочитает её сам.
 */
export function videoDurationProblem(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds > VIDEO_MAX_SECONDS + 0.5)
    return `Ролик длиннее ${VIDEO_MAX_SECONDS} секунд — лента для коротких видео`;
  return null;
}

/** «0:07», «1:30» — длина ролика в списке. */
export function formatVideoDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
