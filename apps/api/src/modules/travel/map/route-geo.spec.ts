import { haversineKm, routeDistanceKm } from './route-geo';

const moscow = { lat: 55.7558, lng: 37.6173 };
const spb = { lat: 59.9343, lng: 30.3351 };

describe('route-geo', () => {
  it('Москва — Петербург около 634 км', () => {
    expect(Math.abs(haversineKm(moscow, spb) - 634)).toBeLessThan(5);
  });

  it('расстояние от точки до себя — ноль', () => {
    expect(haversineKm(moscow, moscow)).toBe(0);
  });

  it('пустой и одиночный список дают 0', () => {
    expect(routeDistanceKm([])).toBe(0);
    expect(routeDistanceKm([moscow])).toBe(0);
  });

  it('суммирует участки и округляет до одного знака', () => {
    const mid = { lat: 58, lng: 34 };
    const total = routeDistanceKm([moscow, mid, spb]);
    expect(total).toBeGreaterThanOrEqual(haversineKm(moscow, spb) - 0.1);
    expect(Math.abs(total * 10 - Math.round(total * 10))).toBeLessThan(1e-6);
    expect(String(total).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
