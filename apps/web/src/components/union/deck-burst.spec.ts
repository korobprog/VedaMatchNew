import { describe, expect, it } from "vitest";
import { burstRays, TOAST_MS } from "./deck-burst";

describe("burstRays", () => {
  it("spreads the rays around the full circle", () => {
    const rays = burstRays(8, 100);
    expect(rays).toHaveLength(8);
    // Первый луч смотрит вправо, четвёртый — влево: круг пройден целиком,
    // а не одним сектором.
    expect(rays[0].dx).toBeGreaterThan(0);
    expect(rays[4].dx).toBeLessThan(0);
    expect(rays.some((ray) => ray.dy > 0)).toBe(true);
    expect(rays.some((ray) => ray.dy < 0)).toBe(true);
  });

  it("keeps every ray inside the radius", () => {
    for (const ray of burstRays(12, 90)) {
      expect(Math.hypot(ray.dx, ray.dy)).toBeLessThanOrEqual(90);
    }
  });

  // Одинаковые лучи читаются как звёздочка, а не как салют.
  it("varies the length so the rays are not a regular star", () => {
    const lengths = burstRays(12, 90).map((ray) =>
      Math.round(Math.hypot(ray.dx, ray.dy)),
    );
    expect(new Set(lengths).size).toBeGreaterThan(1);
  });

  // Гидратация: `Math.random()` дал бы на сервере и в браузере разные лучи.
  it("is deterministic", () => {
    expect(burstRays(10, 80)).toEqual(burstRays(10, 80));
  });

  it("staggers the rays without holding the last one back", () => {
    const delays = burstRays(8, 80).map((ray) => ray.delay);
    expect(Math.min(...delays)).toBe(0);
    expect(Math.max(...delays)).toBeLessThan(TOAST_MS / 1000);
  });

  it("returns nothing for an empty burst", () => {
    expect(burstRays(0, 80)).toEqual([]);
    expect(burstRays(8, 0)).toEqual([]);
  });
});
