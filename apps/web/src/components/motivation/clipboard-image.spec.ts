import { describe, expect, it } from "vitest";
import {
  formatImageSize,
  isReelImageType,
  pastedImageName,
  pastedImageRejection,
  pickClipboardType,
  pickPastedImage,
  REEL_IMAGE_MAX_BYTES,
} from "./clipboard-image";

const file = (type: string, size = 1024, name = "x") =>
  ({ type, size, name }) as File;

describe("isReelImageType", () => {
  it("принимает то же, что сервер", () => {
    expect(isReelImageType("image/jpeg")).toBe(true);
    expect(isReelImageType("image/png")).toBe(true);
    expect(isReelImageType("image/webp")).toBe(true);
  });

  it("остальное — нет", () => {
    expect(isReelImageType("image/gif")).toBe(false);
    expect(isReelImageType("text/plain")).toBe(false);
    expect(isReelImageType(null)).toBe(false);
    expect(isReelImageType(undefined)).toBe(false);
  });

  it("регистр из буфера не мешает", () => {
    expect(isReelImageType("IMAGE/PNG")).toBe(true);
  });
});

describe("pickPastedImage", () => {
  it("берёт первый подходящий кадр", () => {
    const png = file("image/png");
    expect(pickPastedImage([file("text/html"), png, file("image/jpeg")])).toBe(
      png,
    );
  });

  it("вставка без картинки ничего не даёт", () => {
    // Скопировали текст: файлов нет вовсе или они не того вида.
    expect(pickPastedImage([file("text/plain")])).toBeNull();
    expect(pickPastedImage([])).toBeNull();
    expect(pickPastedImage(null)).toBeNull();
  });
});

describe("pickClipboardType", () => {
  it("из нескольких видов выбирает наш порядок, а не порядок браузера", () => {
    expect(pickClipboardType(["text/plain", "image/webp", "image/jpeg"])).toBe(
      "image/jpeg",
    );
  });

  it("картинки в буфере нет — нечего забирать", () => {
    expect(pickClipboardType(["text/plain"])).toBeNull();
    expect(pickClipboardType(null)).toBeNull();
  });
});

describe("pastedImageName", () => {
  it("имя различимо и без кириллицы: оно уезжает в multipart", () => {
    const name = pastedImageName(
      "image/png",
      new Date("2026-09-10T13:20:05.000Z"),
    );
    expect(name).toBe("vstavka-2026-09-10-13-20-05.png");
    expect(name).toMatch(/^[\w.-]+$/);
  });

  it("расширение соответствует типу", () => {
    const at = new Date("2026-09-10T00:00:00.000Z");
    expect(pastedImageName("image/jpeg", at)).toContain(".jpg");
    expect(pastedImageName("image/webp", at)).toContain(".webp");
  });
});

describe("pastedImageRejection", () => {
  it("подходящий кадр пропускает", () => {
    expect(pastedImageRejection({ type: "image/png", size: 2048 })).toBeNull();
  });

  it("пустой буфер объясняет, что делать", () => {
    expect(pastedImageRejection(null)).toContain("скопируйте");
  });

  it("чужой формат называет допустимые", () => {
    expect(pastedImageRejection({ type: "image/gif", size: 10 })).toBe(
      "Подойдёт JPEG, PNG или WebP",
    );
  });

  it("слишком большой кадр отсекается здесь, а не после отправки", () => {
    expect(
      pastedImageRejection({
        type: "image/png",
        size: REEL_IMAGE_MAX_BYTES + 1,
      }),
    ).toContain("12 МБ");
  });
});

describe("formatImageSize", () => {
  it("показывает размер словами", () => {
    expect(formatImageSize(512)).toBe("512 Б");
    expect(formatImageSize(2048)).toBe("2 КБ");
    expect(formatImageSize(2_516_582)).toBe("2,4 МБ");
  });
});
