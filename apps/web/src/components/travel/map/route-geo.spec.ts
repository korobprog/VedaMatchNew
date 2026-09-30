import { describe, expect, it } from "vitest";
import { formatDistance, haversineKm, routeDistanceKm } from "./route-geo";

describe("haversineKm", () => {
  it("нулевое расстояние для одной точки", () => {
    expect(haversineKm({ lat: 55, lng: 37 }, { lat: 55, lng: 37 })).toBe(0);
  });
  it("градус по меридиану около 111 км", () => {
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(111);
    expect(d).toBeLessThan(111.4);
  });
  it("Москва - Санкт-Петербург около 634 км", () => {
    const d = haversineKm(
      { lat: 55.7558, lng: 37.6173 },
      { lat: 59.9343, lng: 30.3351 },
    );
    expect(d).toBeGreaterThan(625);
    expect(d).toBeLessThan(645);
  });
});

describe("routeDistanceKm", () => {
  it("пусто и одна точка дают 0", () => {
    expect(routeDistanceKm([])).toBe(0);
    expect(routeDistanceKm([{ lat: 1, lng: 1 }])).toBe(0);
  });
  it("суммирует участки и округляет до 0,1", () => {
    const d = routeDistanceKm([
      { lat: 0, lng: 0 },
      { lat: 0.01, lng: 0 },
      { lat: 0.02, lng: 0 },
    ]);
    expect(d).toBe(2.2);
  });
});

describe("formatDistance", () => {
  it("метры до километра", () => {
    expect(formatDistance(0.85)).toBe("850 м");
  });
  it("запятая и один знак до десяти километров", () => {
    expect(formatDistance(3.4)).toBe("3,4 км");
  });
  it("целые километры от десяти", () => {
    expect(formatDistance(12.4)).toBe("12 км");
  });
});
