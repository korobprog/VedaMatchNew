import { describe, expect, it } from "vitest";
import {
  BOOK_FILE_ACCEPT,
  bookFileRejection,
  bookUploadMessage,
  completeRetriable,
  formatFileSize,
} from "./book-files";

/* VED-662: файлы книг Библиотеки. */
describe("bookFileRejection", () => {
  const ok = { name: "Гита.epub", size: 1024 };

  it("книгу в пределах правил пропускает", () => {
    expect(bookFileRejection(ok, 0)).toBeNull();
    expect(BOOK_FILE_ACCEPT).toContain(".fb2");
  });

  it("отбивает формат, пустоту, размер и лишний файл", () => {
    expect(bookFileRejection({ ...ok, name: "setup.exe" }, 0)).toBe(
      "unsupported_book_format",
    );
    expect(bookFileRejection({ ...ok, size: 0 }, 0)).toBe("book_file_empty");
    expect(bookFileRejection({ ...ok, size: 101 * 1024 * 1024 }, 0)).toBe(
      "book_file_too_large",
    );
    expect(bookFileRejection(ok, 10)).toBe("too_many_book_files");
  });
});

describe("bookUploadMessage", () => {
  it("называет причину словами, незнакомую — общей фразой", () => {
    expect(bookUploadMessage("book_file_too_large")).toMatch(/100 МБ/);
    expect(bookUploadMessage("teapot")).toMatch(/не загрузился/);
  });

  it("сбой хранилища не называет ошибкой файла", () => {
    expect(bookUploadMessage("book_storage_unavailable")).toMatch(
      /не потерян/,
    );
    expect(bookUploadMessage("book_file_content_mismatch")).toMatch(
      /расширению/,
    );
    expect(bookUploadMessage("storage_rejected")).toMatch(/не приняло/);
  });
});

describe("completeRetriable", () => {
  it("переспрашивает при обрыве сети и сбое сервера", () => {
    expect(completeRetriable("network")).toBe(true);
    expect(completeRetriable("book_storage_unavailable")).toBe(true);
    expect(completeRetriable("500")).toBe(true);
    expect(completeRetriable("502")).toBe(true);
  });

  it("отказ по существу не повторяет", () => {
    expect(completeRetriable("book_file_too_large")).toBe(false);
    expect(completeRetriable("book_file_content_mismatch")).toBe(false);
    expect(completeRetriable("too_many_book_files")).toBe(false);
    expect(completeRetriable("403")).toBe(false);
    expect(completeRetriable("")).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("с запятой и единицей", () => {
    expect(formatFileSize(512)).toBe("512 Б");
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2,4 МБ");
    expect(formatFileSize(640 * 1024)).toBe("640 КБ");
  });
});
