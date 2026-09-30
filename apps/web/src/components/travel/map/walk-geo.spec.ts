import { describe, expect, it } from "vitest";
import { bearingDeg, compassLabel, nextStopHint } from "./walk-geo";

const MOSCOW = { lat: 55.7558, lng: 37.6173 };
const SPB = { lat: 59.9343, lng: 30.3351 };

describe("bearingDeg", () => {
  it("Москва → Петербург около 330°", () => {
    expect(Math.abs(bearingDeg(MOSCOW, SPB) - 330)).toBeLessThan(10);
  });
  it("строго на восток и на юг", () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 3);
    expect(bearingDeg({ lat: 1, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(180, 3);
  });
  it("всегда в диапазоне 0..360", () => {
    const v = bearingDeg(SPB, MOSCOW);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(360);
  });
});

describe("compassLabel", () => {
  it("восемь румбов", () => {
    expect(compassLabel(0)).toBe("на север");
    expect(compassLabel(45)).toBe("на северо-восток");
    expect(compassLabel(90)).toBe("на восток");
    expect(compassLabel(135)).toBe("на юго-восток");
    expect(compassLabel(180)).toBe("на юг");
    expect(compassLabel(225)).toBe("на юго-запад");
    expect(compassLabel(270)).toBe("на запад");
    expect(compassLabel(315)).toBe("на северо-запад");
  });
  it("границы секторов", () => {
    expect(compassLabel(22.4)).toBe("на север");
    expect(compassLabel(22.5)).toBe("на северо-восток");
    expect(compassLabel(337.4)).toBe("на северо-запад");
    expect(compassLabel(337.5)).toBe("на север");
    expect(compassLabel(359.9)).toBe("на север");
    expect(compassLabel(-45)).toBe("на северо-запад");
    expect(compassLabel(360)).toBe("на север");
  });
});

describe("nextStopHint", () => {
  it("расстояние и румб", () => {
    const from = { lat: 55.75, lng: 37.6 };
    const to = { lat: 55.75, lng: 37.6 + 0.0065 };
    const hint = nextStopHint(from, to);
    expect(hint).toMatch(/^До следующей: \d+ м, на восток$/);
  });
  it("рядом — на месте", () => {
    expect(nextStopHint(MOSCOW, MOSCOW)).toBe("Вы на месте");
  });
  it("далеко — километры", () => {
    expect(nextStopHint(MOSCOW, SPB)).toMatch(/км, на северо-запад$/);
  });
});
