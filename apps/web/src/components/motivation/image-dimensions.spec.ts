import { describe, expect, it } from "vitest";
import { REEL_IMAGE_MIN_SIDE, imageSizeRejection } from "./image-dimensions";

const UNREADABLE = "Не удалось прочитать картинку — попробуйте другой файл";

describe("imageSizeRejection", () => {
  it("accepts a frame whose shorter side is exactly the minimum", () => {
    expect(
      imageSizeRejection({ width: REEL_IMAGE_MIN_SIDE, height: 1200 }),
    ).toBeNull();
    expect(
      imageSizeRejection({ width: 1200, height: REEL_IMAGE_MIN_SIDE }),
    ).toBeNull();
    expect(
      imageSizeRejection({
        width: REEL_IMAGE_MIN_SIDE,
        height: REEL_IMAGE_MIN_SIDE,
      }),
    ).toBeNull();
  });

  it("accepts an ordinary aphorism picture", () => {
    expect(imageSizeRejection({ width: 1080, height: 1350 })).toBeNull();
  });

  it("rejects one point below the minimum side", () => {
    expect(
      imageSizeRejection({ width: REEL_IMAGE_MIN_SIDE - 1, height: 1200 }),
    ).toContain("399×1200");
    expect(
      imageSizeRejection({ width: 1200, height: REEL_IMAGE_MIN_SIDE - 1 }),
    ).toContain("1200×399");
  });

  it("names the real size of the frame, not just the requirement", () => {
    const message = imageSizeRejection({ width: 320, height: 240 });

    expect(message).toContain("320×240");
    expect(message).toContain(String(REEL_IMAGE_MIN_SIDE));
  });

  it("rounds fractional sides", () => {
    expect(imageSizeRejection({ width: 319.6, height: 240.2 })).toContain(
      "320×240",
    );
  });

  // Нулевые размеры — признак «картинка ещё не загрузилась» или «декодер не
  // справился». Годный кадр не должен получать за это отказ «слишком мелкий».
  it.each([
    [{ width: 0, height: 0 }],
    [{ width: 0, height: 1350 }],
    [{ width: 1080, height: 0 }],
    [{ width: Number.NaN, height: Number.NaN }],
    [{ width: Number.POSITIVE_INFINITY, height: 1350 }],
    [{ width: -1080, height: -1350 }],
  ])("calls %j unreadable instead of small", (size) => {
    expect(imageSizeRejection(size)).toBe(UNREADABLE);
  });

  it("calls a frame it could not measure at all unreadable", () => {
    expect(imageSizeRejection(null)).toBe(UNREADABLE);
  });
});
