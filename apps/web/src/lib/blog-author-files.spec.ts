import { describe, expect, it } from "vitest";
import {
  authorFileErrorText,
  authorFilePreflight,
  formatBytes,
} from "./blog-author-files";

describe("authorFilePreflight", () => {
  it("принимает подходящий файл", () => {
    expect(authorFilePreflight({ name: "a.mp3", size: 1000 }, 0)).toBeNull();
  });
  it("отбивает чужой формат и пустой файл", () => {
    expect(authorFilePreflight({ name: "a.exe", size: 10 }, 0)).toBe(
      "unsupported_file_format",
    );
    expect(authorFilePreflight({ name: "a.pdf", size: 0 }, 0)).toBe(
      "file_empty",
    );
  });
  it("размер считается по виду файла", () => {
    const big = 150 * 1024 * 1024;
    expect(authorFilePreflight({ name: "a.pdf", size: big }, 0)).toBe(
      "file_too_large",
    );
    expect(authorFilePreflight({ name: "a.mp3", size: big }, 0)).toBeNull();
    expect(authorFilePreflight({ name: "a.mp4", size: big }, 0)).toBeNull();
  });
  it("отбивает по числу файлов", () => {
    expect(authorFilePreflight({ name: "a.txt", size: 5 }, 50)).toBe(
      "too_many_files",
    );
  });
});

describe("formatBytes", () => {
  it("форматирует размеры", () => {
    expect(formatBytes(640 * 1024)).toBe("640 КБ");
    expect(formatBytes(2.4 * 1024 * 1024)).toBe("2,4 МБ");
    expect(formatBytes(12)).toBe("12 Б");
  });
});

describe("authorFileErrorText", () => {
  it("называет известные коды и не падает на чужих", () => {
    expect(authorFileErrorText("file_empty")).toBe("Файл пустой.");
    expect(authorFileErrorText("wat")).toContain("не загрузился");
  });
});
