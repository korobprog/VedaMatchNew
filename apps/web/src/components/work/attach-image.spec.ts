import { describe, expect, it } from "vitest";
import {
  ATTACH_IMAGE_MAX_WIDTH,
  ATTACH_IMAGE_MIN_BYTES,
  shouldShrinkImage,
  shrunkImageName,
  shrunkImageSize,
  smallerImage,
} from "./attach-image";

const MB = 1024 * 1024;

describe("shouldShrinkImage (VED-582)", () => {
  it("ужимает скриншоты и фото", () => {
    expect(shouldShrinkImage({ type: "image/png", size: 3 * MB })).toBe(true);
    expect(shouldShrinkImage({ type: "image/jpeg", size: 2 * MB })).toBe(true);
    expect(shouldShrinkImage({ type: "image/webp", size: MB })).toBe(true);
  });

  it("GIF не трогает — canvas оставил бы от анимации первый кадр", () => {
    expect(shouldShrinkImage({ type: "image/gif", size: 5 * MB })).toBe(false);
  });

  it("документы не трогает", () => {
    expect(shouldShrinkImage({ type: "application/pdf", size: 5 * MB })).toBe(
      false,
    );
    expect(shouldShrinkImage({ type: "", size: 5 * MB })).toBe(false);
  });

  it("мелкие картинки уходят как есть", () => {
    expect(
      shouldShrinkImage({
        type: "image/png",
        size: ATTACH_IMAGE_MIN_BYTES - 1,
      }),
    ).toBe(false);
    expect(
      shouldShrinkImage({ type: "image/png", size: ATTACH_IMAGE_MIN_BYTES }),
    ).toBe(true);
  });
});

describe("shrunkImageSize", () => {
  it("широкое ужимает до ширины сервера с теми же пропорциями", () => {
    expect(shrunkImageSize(3200, 1800)).toEqual({ width: 1600, height: 900 });
  });

  it("скриншот телефона уже предела по ширине — размер не меняется", () => {
    expect(shrunkImageSize(1280, 2772)).toEqual({ width: 1280, height: 2772 });
  });

  it("высоту не ограничивает, как и сервер: длинный скриншот читаем", () => {
    expect(shrunkImageSize(2560, 8000)).toEqual({ width: 1600, height: 5000 });
  });

  it("предел ширины совпадает с серверным", () => {
    expect(ATTACH_IMAGE_MAX_WIDTH).toBe(1600);
  });

  it("округляет и не даёт нулевой стороны", () => {
    expect(shrunkImageSize(4000, 1)).toEqual({ width: 1600, height: 1 });
    expect(shrunkImageSize(1601, 1001)).toEqual({ width: 1600, height: 1000 });
  });

  it("пустую и слишком большую для canvas картинку не рисует", () => {
    expect(shrunkImageSize(0, 100)).toBeNull();
    expect(shrunkImageSize(100, 0)).toBeNull();
    expect(shrunkImageSize(1600, 20_000)).toBeNull();
  });
});

describe("smallerImage", () => {
  it("отправляет ужатое, когда оно меньше", () => {
    const original = { size: 3 * MB, name: "a" };
    const shrunk = { size: 400 * 1024, name: "b" };
    expect(smallerImage(original, shrunk)).toBe(shrunk);
  });

  it("не меньше исходника — уходит исходник", () => {
    const original = { size: 300 * 1024, name: "a" };
    expect(smallerImage(original, { size: 300 * 1024, name: "b" })).toBe(
      original,
    );
    expect(smallerImage(original, { size: 500 * 1024, name: "b" })).toBe(
      original,
    );
  });

  it("ужать не вышло — уходит исходник", () => {
    const original = { size: MB };
    expect(smallerImage(original, null)).toBe(original);
  });
});

describe("shrunkImageName", () => {
  it("меняет расширение под новый формат", () => {
    expect(shrunkImageName("Screenshot_2026.png", "image/webp")).toBe(
      "Screenshot_2026.webp",
    );
    expect(shrunkImageName("фото.jpeg", "image/jpeg")).toBe("фото.jpg");
  });

  it("имя без расширения получает расширение", () => {
    expect(shrunkImageName("скрин", "image/webp")).toBe("скрин.webp");
  });

  it("точки в середине имени не трогает", () => {
    expect(shrunkImageName("экран 27.09.2026.png", "image/webp")).toBe(
      "экран 27.09.2026.webp",
    );
  });

  it("пустое имя не остаётся пустым", () => {
    expect(shrunkImageName(".png", "image/webp")).toBe("image.webp");
  });
});
