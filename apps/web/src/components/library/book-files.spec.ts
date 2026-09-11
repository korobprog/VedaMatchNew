import { describe, expect, it } from "vitest";
import {
  BOOK_FILE_ACCEPT,
  BOOK_UPLOAD_ERROR_KEYS,
  bookFileRejection,
  bookUploadErrorKey,
  formatFileSize,
} from "./book-files";
import { libraryDictionary } from "./i18n";

const MB = 1024 * 1024;

describe("bookFileRejection", () => {
  it("пропускает книгу в пределах размера", () => {
    expect(bookFileRejection({ name: "Гита.pdf", size: 5 * MB }, 0)).toBeNull();
    expect(bookFileRejection({ name: "scan.DJV", size: MB }, 4)).toBeNull();
  });

  it("отбивает до заливки то, что отбил бы сервер", () => {
    expect(bookFileRejection({ name: "photo.jpg", size: MB }, 0)).toBe(
      "files.unsupportedFormat",
    );
    expect(bookFileRejection({ name: "a.pdf", size: 0 }, 0)).toBe(
      "files.empty",
    );
    expect(bookFileRejection({ name: "a.pdf", size: 100 * MB + 1 }, 0)).toBe(
      "files.tooLarge",
    );
    expect(bookFileRejection({ name: "a.pdf", size: MB }, 5)).toBe(
      "files.tooMany",
    );
  });
});

describe("BOOK_FILE_ACCEPT", () => {
  it("предлагает все форматы книг и старое .djv", () => {
    expect(BOOK_FILE_ACCEPT.split(",")).toEqual(
      expect.arrayContaining([".pdf", ".epub", ".fb2", ".djvu", ".djv", ".txt"]),
    );
  });
});

describe("bookUploadErrorKey", () => {
  it("у каждого кода есть строка в обоих словарях", () => {
    for (const key of Object.values(BOOK_UPLOAD_ERROR_KEYS)) {
      expect(libraryDictionary.ru[key]).toBeTruthy();
      expect(libraryDictionary.en[key]).toBeTruthy();
    }
  });

  it("незнакомый код — «не загрузился», а не пустота", () => {
    expect(bookUploadErrorKey("brand_new_rule")).toBe("files.failed");
    expect(bookUploadErrorKey("too_many_book_files")).toBe("files.tooMany");
  });
});

describe("formatFileSize", () => {
  it("называет размер привычными единицами", () => {
    expect(formatFileSize(512, "ru")).toBe("512 Б");
    expect(formatFileSize(640 * 1024, "ru")).toBe("640 КБ");
    expect(formatFileSize(2.4 * MB, "ru")).toBe("2,4 МБ");
    expect(formatFileSize(2.4 * MB, "en")).toBe("2.4 MB");
    expect(formatFileSize(37 * MB, "ru")).toBe("37 МБ");
  });
});
