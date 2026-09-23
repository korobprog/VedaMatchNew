import { describe, expect, it } from "vitest";
import { fitSize, ZOOM, zoomScrollOffset } from "./cover-zoom";

/** Экран телефона 360×800 за вычетом панели кнопок и отступов. */
const PHONE = { width: 328, height: 660 };

describe("fitSize (VED-138)", () => {
  it("широкий баннер вписывается по ширине", () => {
    expect(fitSize({ width: 640, height: 249 }, PHONE)).toEqual({
      width: 328,
      height: 128,
    });
  });

  it("вертикаль вписывается по высоте", () => {
    expect(fitSize({ width: 640, height: 1386 }, PHONE)).toEqual({
      width: 305,
      height: 660,
    });
  });

  it("маленькая картинка растягивается до экрана, а не остаётся марочкой", () => {
    expect(fitSize({ width: 640, height: 640 }, { width: 1400, height: 800 })).toEqual({
      width: 800,
      height: 800,
    });
  });

  it("размер неизвестен — нулевой, а не NaN", () => {
    expect(fitSize({ width: 0, height: 0 }, PHONE)).toEqual({ width: 0, height: 0 });
  });
});

describe("zoomScrollOffset (VED-138)", () => {
  it("точка под пальцем остаётся под пальцем", () => {
    // Нажали в правой четверти баннера, палец в 250px от левого края.
    const zoomed = 328 * ZOOM; // 820
    expect(zoomScrollOffset(0.75, zoomed, 328, 250)).toBe(365);
  });

  it("у краёв не уезжает за картинку", () => {
    expect(zoomScrollOffset(0, 820, 328, 100)).toBe(0);
    expect(zoomScrollOffset(1, 820, 328, 10)).toBe(820 - 328);
  });

  it("картинка короче области — прокрутки нет", () => {
    expect(zoomScrollOffset(0.5, 300, 660, 330)).toBe(0);
  });
});
