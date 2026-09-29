import {
  LIBRARY_BOOK_FORMATS,
  LIBRARY_BOOK_MAX_BYTES,
  libraryBookFormatOf,
} from "@vedamatch/shared";

/**
 * Файлы книг Библиотеки на вебе (VED-662, часть 3б): что предложить в окне
 * выбора, что отбить до заливки, как назвать отказ и размер. Правила те
 * же, что на сервере (`vedabase/book-files.ts`).
 */

/** Столько же, сколько принимает сервер. */
export const VEDABASE_BOOK_FILES_PER_BOOK = 10;

export const BOOK_FILE_ACCEPT = [
  ...LIBRARY_BOOK_FORMATS.map((format) => `.${format}`),
  ".djv",
].join(",");

const MESSAGES: Record<string, string> = {
  unsupported_book_format:
    "Такой формат не принимаем. Подходят: pdf, epub, fb2, djvu, mobi, doc, docx, odt, rtf, txt.",
  book_file_empty: "Файл пустой.",
  book_file_too_large: "Файл больше 100 МБ.",
  too_many_book_files: `У книги уже ${VEDABASE_BOOK_FILES_PER_BOOK} файлов — уберите лишний.`,
  book_upload_unavailable: "Хранилище файлов сейчас недоступно.",
  network: "Нет связи — файл не загрузился.",
};

/** Отказ словами; незнакомый код — «не загрузился». */
export function bookUploadMessage(code: string): string {
  return MESSAGES[code] ?? "Файл не загрузился. Попробуйте ещё раз.";
}

/** Отказ до заливки — тот же, что дал бы сервер; `null` — можно лить. */
export function bookFileRejection(
  file: { name: string; size: number },
  filesCount: number,
): string | null {
  if (!libraryBookFormatOf(file.name)) return "unsupported_book_format";
  if (file.size <= 0) return "book_file_empty";
  if (file.size > LIBRARY_BOOK_MAX_BYTES) return "book_file_too_large";
  if (filesCount >= VEDABASE_BOOK_FILES_PER_BOOK) return "too_many_book_files";
  return null;
}

/** «2,4 МБ», «640 КБ» — без `Intl`, чтобы сервер и браузер совпали. */
export function formatFileSize(bytes: number): string {
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
}
