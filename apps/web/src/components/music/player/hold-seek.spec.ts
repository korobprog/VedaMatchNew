import { describe, expect, it } from "vitest";
import { HOLD_THRESHOLD_MS, holdSeekStep, isHold } from "./hold-seek";

describe("holdSeekStep", () => {
  it("начинает с малого шага, чтобы попасть в пропущенную строку", () => {
    expect(holdSeekStep(0)).toBe(2);
  });

  it("разгоняется с каждым тиком", () => {
    expect(holdSeekStep(1)).toBeGreaterThan(holdSeekStep(0));
    expect(holdSeekStep(5)).toBeGreaterThan(holdSeekStep(1));
  });

  it("упирается в потолок: иначе лекция пролетает главу за полсекунды", () => {
    expect(holdSeekStep(1000)).toBe(20);
    expect(holdSeekStep(50)).toBe(20);
  });

  it("не отдаёт отрицательный и нечисловой шаг", () => {
    expect(holdSeekStep(-1)).toBe(2);
    expect(holdSeekStep(Number.NaN)).toBe(2);
  });
});

describe("isHold", () => {
  it("обычное нажатие пальцем переключает запись, а не мотает", () => {
    expect(isHold(120)).toBe(false);
    expect(isHold(HOLD_THRESHOLD_MS - 1)).toBe(false);
  });

  it("на пороге и дальше — удержание", () => {
    expect(isHold(HOLD_THRESHOLD_MS)).toBe(true);
    expect(isHold(2000)).toBe(true);
  });

  it("не считает удержанием мусорное время", () => {
    expect(isHold(Number.NaN)).toBe(false);
  });
});
