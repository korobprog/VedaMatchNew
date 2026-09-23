import { describe, expect, it } from "vitest";
import { coverFrameStyle, naturalRatio, PLACEHOLDER_RATIO } from "./cover-frame";

describe("naturalRatio (VED-138)", () => {
  it("широкий баннер катхи, квадрат и скриншот телефона", () => {
    expect(naturalRatio(640, 249)).toBeCloseTo(2.57, 2);
    expect(naturalRatio(640, 640)).toBe(1);
    expect(naturalRatio(640, 1386)).toBeCloseTo(0.4618, 4);
  });

  it("размер неизвестен — пропорций нет", () => {
    expect(naturalRatio(0, 0)).toBeNull();
    expect(naturalRatio(640, 0)).toBeNull();
    expect(naturalRatio(Number.NaN, 100)).toBeNull();
  });
});

describe("coverFrameStyle (VED-138)", () => {
  it("рамка принимает пропорции картинки — полей нет", () => {
    expect(coverFrameStyle(640 / 249, "28rem")).toEqual({
      aspectRatio: "2.5703",
      width: "min(100cqw, calc(28rem * 2.5703))",
    });
  });

  it("вертикальная картинка упирается в потолок и сужается, а не режется", () => {
    const style = coverFrameStyle(640 / 1386, "70vh");
    expect(style.aspectRatio).toBe("0.4618");
    expect(style.width).toBe("min(100cqw, calc(70vh * 0.4618))");
  });

  it("пока картинка грузится, место держит 16:9", () => {
    expect(coverFrameStyle(null, "28rem").aspectRatio).toBe(
      String(Number(PLACEHOLDER_RATIO.toFixed(4))),
    );
  });
});
