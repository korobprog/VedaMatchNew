import { describe, expect, it } from "vitest";
import { visibleSlidesHeight } from "./carousel-height";

const slides = [
  { left: 0, width: 400, height: 225 },
  { left: 400, width: 400, height: 450 },
  { left: 800, width: 400, height: 300 },
];

describe("visibleSlidesHeight", () => {
  it("садится по слайду, к которому прищёлкнули", () => {
    expect(visibleSlidesHeight(slides, 0, 400)).toBe(225);
    expect(visibleSlidesHeight(slides, 400, 400)).toBe(450);
    expect(visibleSlidesHeight(slides, 800, 400)).toBe(300);
  });

  it("между двумя слайдами — по более высокому, чтобы не обрезать", () => {
    expect(visibleSlidesHeight(slides, 200, 400)).toBe(450);
  });

  it("сосед вплотную к краю высоту не держит", () => {
    expect(visibleSlidesHeight(slides, 0.5, 400)).toBe(225);
  });

  it("несколько слайдов в ряд на широком экране — по самому высокому", () => {
    expect(visibleSlidesHeight(slides, 0, 1200)).toBe(450);
  });

  it("мерить нечего — высоту не задаём", () => {
    expect(visibleSlidesHeight([], 0, 400)).toBeNull();
  });
});
