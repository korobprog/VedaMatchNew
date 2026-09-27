import { describe, expect, it } from "vitest";
import { formatDegrees } from "./astro-degrees";

describe("formatDegrees", () => {
  it("градусы и минуты с ведущим нулём", () => {
    expect(formatDegrees(23.669)).toBe("23°40′");
    expect(formatDegrees(0)).toBe("0°00′");
    expect(formatDegrees(8.05)).toBe("8°03′");
  });

  it("точные минуты не теряются на двоичной дроби", () => {
    expect(formatDegrees(15 + 23 / 60)).toBe("15°23′");
    expect(formatDegrees(10 + 1 / 60)).toBe("10°01′");
  });

  it("минуты отбрасываются, а не округляются до следующего градуса", () => {
    expect(formatDegrees(29.9999)).toBe("29°59′");
  });

  it("мусор на входе не превращается в NaN°", () => {
    expect(formatDegrees(Number.NaN)).toBe("0°00′");
    expect(formatDegrees(-1)).toBe("0°00′");
  });
});
