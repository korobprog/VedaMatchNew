import { describe, expect, it } from "vitest";
import { isTap, tappedPhotoIndex, TAP_SLOP } from "./photo-tap";

describe("isTap", () => {
  it("treats a still finger as a tap", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });

  it("allows jitter up to the slop", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100 + TAP_SLOP, y: 100 })).toBe(true);
  });

  // Риск: слой лежит поверх перетаскиваемой карточки. Без порога свайп
  // решения засчитался бы ещё и как переключение фото.
  it("rejects a horizontal swipe", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 240, y: 100 })).toBe(false);
  });

  it("rejects a vertical swipe", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 20 })).toBe(false);
  });
});

describe("tappedPhotoIndex", () => {
  const bounds = { boundsLeft: 0, boundsWidth: 300 };

  it("moves forward on the right half", () => {
    expect(
      tappedPhotoIndex({ currentIndex: 0, total: 3, tapX: 250, ...bounds }),
    ).toBe(1);
  });

  it("moves back on the left half", () => {
    expect(
      tappedPhotoIndex({ currentIndex: 1, total: 3, tapX: 50, ...bounds }),
    ).toBe(0);
  });

  it("wraps around at both ends", () => {
    expect(
      tappedPhotoIndex({ currentIndex: 2, total: 3, tapX: 250, ...bounds }),
    ).toBe(0);
    expect(
      tappedPhotoIndex({ currentIndex: 0, total: 3, tapX: 50, ...bounds }),
    ).toBe(2);
  });

  // Карточка не прижата к левому краю окна: без вычета boundsLeft тап по
  // левой половине на смещённой карточке считался бы правым.
  it("measures halves relative to the element, not the window", () => {
    expect(
      tappedPhotoIndex({
        currentIndex: 0,
        total: 3,
        tapX: 460,
        boundsLeft: 400,
        boundsWidth: 300,
      }),
    ).toBe(2);
  });
});
