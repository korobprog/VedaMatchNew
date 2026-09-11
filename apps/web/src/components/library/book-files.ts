import {
  LIBRARY_BOOK_FILES_PER_ENTRY,
  LIBRARY_BOOK_FORMATS,
  LIBRARY_BOOK_MAX_BYTES,
  libraryBookFormatOf,
  type LibraryLocale,
} from "@vedamatch/shared";
import type { LibraryTextKey } from "./i18n";

/**
 * Файлы книг на вебе: что предложить в окне выбора, что отбить ещё до
 * заливки и как назвать размер. Правила те же, что на сервере
 * (book-files.ts в API), — через общий список форматов из shared.
 */

/** Что предложить в окне выбора файла. `.djv` — старое расширение djvu. */
export const BOOK_FILE_ACCEPT = [
  ...LIBRARY_BOOK_FORMATS.map((format) => `.${format}`),
  ".djv",
].join(",");

/**
 * Отказ ещё до заливки — тот же, что дал бы сервер, но без сотни мегабайт,
 * пролитых впустую, чтобы услышать «формат не тот».
 */
export function bookFileRejection(
  file: { name: string; size: number },
  filesCount: number,
): LibraryTextKey | null {
  if (!libraryBookFormatOf(file.name)) return "files.unsupportedFormat";
  if (file.size <= 0) return "files.empty";
  if (file.size > LIBRARY_BOOK_MAX_BYTES) return "files.tooLarge";
  if (filesCount >= LIBRARY_BOOK_FILES_PER_ENTRY) return "files.tooMany";
  return null;
}

/**
 * Коды отказа — строкой словаря. Покрывает все `BadRequestException` и 403
 * из library-files.service.ts, плюс два сбоя самой заливки в бакет.
 */
export const BOOK_UPLOAD_ERROR_KEYS: Record<string, LibraryTextKey> = {
  unsupported_book_format: "files.unsupportedFormat",
  book_file_empty: "files.empty",
  book_file_too_large: "files.tooLarge",
  too_many_book_files: "files.tooMany",
  book_upload_unavailable: "files.unavailable",
  not_entry_owner: "files.forbidden",
  book_file_missing: "files.failed",
  book_key_mismatch: "files.failed",
  storage_rejected: "files.failed",
  network: "files.network",
};

/** Строка словаря для отказа с кодом; незнакомый код — «не загрузился». */
export function bookUploadErrorKey(code: string): LibraryTextKey {
  return BOOK_UPLOAD_ERROR_KEYS[code] ?? "files.failed";
}

/**
 * «2,4 МБ», «640 КБ». Без `Intl`: страница рендерится и на сервере, и
 * расхождение форматирования между ними даёт ошибку гидратации.
 */
export function formatFileSize(bytes: number, locale: LibraryLocale): string {
  const units =
    locale === "ru" ? ["Б", "КБ", "МБ", "ГБ"] : ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  const number = value.toFixed(digits);
  return `${locale === "ru" ? number.replace(".", ",") : number} ${units[unit]}`;
}
