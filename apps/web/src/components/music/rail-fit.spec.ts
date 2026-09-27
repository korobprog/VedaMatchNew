import { describe, expect, it } from "vitest";
import { fitRailWidth } from "./rail-fit";

describe("fitRailWidth (VED-535)", () => {
  // Примерно как на телефоне 412px: «Каталог», «Избранное 3», «Плейлисты 2»,
  // «История», «У друзей»…
  const widths = [96.4, 118.2, 122.7, 96.1, 101.3];
  const gap = 2;

  it("окно кончается за последним пунктом, влезшим целиком", () => {
    // 96.4 + 2 + 118.2 + 2 + 122.7 = 341.3; с «Историей» — 439.4.
    expect(fitRailWidth(widths, gap, 366)).toBe(342);
    expect(fitRailWidth(widths, gap, 439)).toBe(342 + 97);
    expect(fitRailWidth(widths, gap, 438)).toBe(342);
  });

  it("от следующего пункта не видно ни пикселя", () => {
    const width = fitRailWidth(widths, gap, 400);
    const nextStarts = 96.4 + 118.2 + 122.7 + 3 * gap;
    expect(width).toBeLessThan(nextStarts);
  });

  it("полпикселя округления не выкидывают пункт, но окно не шире места", () => {
    expect(fitRailWidth(widths, gap, 441)).toBe(440);
    expect(fitRailWidth(widths, gap, 439.1)).toBe(439);
  });

  it("всё влезло — окно по всему ряду", () => {
    expect(fitRailWidth([50, 60], 4, 500)).toBe(114);
  });

  it("не влез даже первый — окно во всё место", () => {
    expect(fitRailWidth([300, 60], 4, 250.6)).toBe(250);
  });

  it("пустой ряд или нет места", () => {
    expect(fitRailWidth([], 2, 300)).toBe(300);
    expect(fitRailWidth([10], 2, 0)).toBe(0);
  });
});
