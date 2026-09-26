import { describe, expect, it } from "vitest";
import { localDay, shouldNudgeRail } from "./rail-nudge";

describe("shouldNudgeRail (VED-535)", () => {
  const now = new Date(2026, 8, 26, 9, 30);
  const base = { now, scrollable: true, reducedMotion: false };

  it("первый заход за день — подсказка есть", () => {
    expect(shouldNudgeRail({ ...base, lastDay: null })).toBe(true);
    expect(shouldNudgeRail({ ...base, lastDay: "2026-09-25" })).toBe(true);
  });

  it("второй раз за день — нет", () => {
    expect(shouldNudgeRail({ ...base, lastDay: localDay(now) })).toBe(false);
  });

  it("ряд влез целиком или анимации выключены — нет", () => {
    expect(shouldNudgeRail({ ...base, lastDay: null, scrollable: false })).toBe(
      false,
    );
    expect(
      shouldNudgeRail({ ...base, lastDay: null, reducedMotion: true }),
    ).toBe(false);
  });

  it("день — местный, с ведущими нулями", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
