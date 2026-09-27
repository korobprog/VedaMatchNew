import { describe, expect, it } from "vitest";
import {
  MIN_THUMB,
  scrollTopForThumb,
  thumbGeometry,
} from "./scroll-scrubber-geometry";

describe("thumbGeometry (VED-478)", () => {
  it("нечего прокручивать — бегунка нет", () => {
    expect(thumbGeometry(0, 300, 300, 280)).toBeNull();
  });

  it("длина по доле видимого, место по доле прокрученного", () => {
    expect(thumbGeometry(0, 1000, 250, 200)).toEqual({ top: 0, height: 50 });
    expect(thumbGeometry(750, 1000, 250, 200)).toEqual({
      top: 150,
      height: 50,
    });
  });

  it("не короче пальца на очень длинном тексте", () => {
    expect(thumbGeometry(0, 100_000, 250, 200)?.height).toBe(MIN_THUMB);
  });
});

describe("scrollTopForThumb", () => {
  it("переводит положение бегунка в прокрутку и не выходит за края", () => {
    expect(scrollTopForThumb(75, 200, 50, 750)).toBe(375);
    expect(scrollTopForThumb(-10, 200, 50, 750)).toBe(0);
    expect(scrollTopForThumb(500, 200, 50, 750)).toBe(750);
  });
});
