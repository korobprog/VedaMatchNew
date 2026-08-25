import { describe, expect, it } from "vitest";
import {
  AUTOPLAY_IDLE_MS,
  AUTOPLAY_STEP_MS,
  nextPhotoIndex,
  shouldAutoplay,
} from "./photo-autoplay";

describe("nextPhotoIndex", () => {
  it("walks forward and wraps to the first photo", () => {
    expect(nextPhotoIndex(0, 3)).toBe(1);
    expect(nextPhotoIndex(1, 3)).toBe(2);
    expect(nextPhotoIndex(2, 3)).toBe(0);
  });

  // Индекс мог остаться от прошлой анкеты, у которой снимков было больше.
  it("clamps an index left over from a longer gallery", () => {
    expect(nextPhotoIndex(9, 3)).toBe(0);
    expect(nextPhotoIndex(-4, 3)).toBe(1);
  });

  it("stays at zero when there is nothing to show", () => {
    expect(nextPhotoIndex(0, 0)).toBe(0);
  });
});

describe("shouldAutoplay", () => {
  it("needs more than one photo", () => {
    expect(shouldAutoplay(3, false)).toBe(true);
    expect(shouldAutoplay(1, false)).toBe(false);
    expect(shouldAutoplay(0, false)).toBe(false);
  });

  // Само-меняющаяся картинка — движение, которого человек попросил не делать.
  it("stays still when motion is reduced", () => {
    expect(shouldAutoplay(3, true)).toBe(false);
  });

  // Тап по краю — это и есть «пауза»: человек листает сам.
  it("stops while paused", () => {
    expect(shouldAutoplay(3, false, true)).toBe(false);
  });
});

describe("timings", () => {
  it("reads before it moves", () => {
    expect(AUTOPLAY_IDLE_MS).toBeGreaterThan(AUTOPLAY_STEP_MS);
  });
});
