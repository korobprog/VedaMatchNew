import { describe, expect, it } from "vitest";
import { scaleForSide } from "./scan-image";

describe("scaleForSide", () => {
  it("не растягивает мелкий снимок", () => {
    expect(scaleForSide(800, 600)).toBe(1);
    expect(scaleForSide(1600, 1200)).toBe(1);
  });

  it("ужимает по длинной стороне, а не по ширине", () => {
    expect(scaleForSide(1200, 3200)).toBeCloseTo(0.5);
    expect(scaleForSide(3200, 1200)).toBeCloseTo(0.5);
  });

  it("терпит нулевой размер и не делит на ноль", () => {
    expect(scaleForSide(0, 0)).toBe(1);
  });
});
