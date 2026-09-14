import { describe, expect, it } from "vitest";
import {
  COVER_IMAGE_ACCEPT,
  COVER_IMAGE_TYPES,
  isCoverImage,
} from "./cover-image";

describe("COVER_IMAGE_ACCEPT", () => {
  // VED-134: на одних картинках Chrome на Android открывает «Галерею фото»
  // без файлового менеджера.
  it("содержит тип не-картинку, чтобы на телефоне открывался выбор файлов", () => {
    const types = COVER_IMAGE_ACCEPT.split(",");
    expect(
      types.some((type) => !type.startsWith("image/") && !type.startsWith("video/")),
    ).toBe(true);
  });

  it("по-прежнему предлагает все картинки, которые принимает сервер", () => {
    const types = COVER_IMAGE_ACCEPT.split(",");
    for (const type of COVER_IMAGE_TYPES) expect(types).toContain(type);
  });
});

describe("isCoverImage", () => {
  it("пропускает jpg, png и webp", () => {
    expect(isCoverImage({ type: "image/jpeg" })).toBe(true);
    expect(isCoverImage({ type: "image/png" })).toBe(true);
    expect(isCoverImage({ type: "image/webp" })).toBe(true);
  });

  it("не пропускает то, что сервер отобьёт", () => {
    expect(isCoverImage({ type: "application/octet-stream" })).toBe(false);
    expect(isCoverImage({ type: "application/pdf" })).toBe(false);
    expect(isCoverImage({ type: "image/heic" })).toBe(false);
    expect(isCoverImage({ type: "" })).toBe(false);
  });
});
