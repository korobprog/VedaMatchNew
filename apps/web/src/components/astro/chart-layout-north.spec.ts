import { describe, expect, it } from "vitest";
import type { GrahaPosition, VedicChart } from "@vedamatch/shared";
import {
  NORTH_CELLS,
  NORTH_LINES,
  NORTH_SIZE,
  grahasByBhava,
  rashiOfBhava,
} from "./chart-layout-north";

/** Точки контура клетки числами — для проверки площади и попадания в квадрат. */
function pointsOf(cell: (typeof NORTH_CELLS)[number]): [number, number][] {
  return cell.points
    .split(" ")
    .map((pair) => pair.split(",").map(Number) as [number, number]);
}

/** Площадь многоугольника по формуле шнурков. */
function area(points: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

describe("клетки северной карты", () => {
  it("их ровно двенадцать и дома идут по порядку", () => {
    expect(NORTH_CELLS).toHaveLength(12);
    expect(NORTH_CELLS.map((c) => c.bhava)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("покрывают квадрат целиком и без нахлёста", () => {
    // Сумма площадей равна площади квадрата — значит ни щелей, ни наложений.
    const total = NORTH_CELLS.reduce((sum, c) => sum + area(pointsOf(c)), 0);
    expect(total).toBeCloseTo(NORTH_SIZE * NORTH_SIZE, 5);
  });

  it("не выходят за пределы квадрата", () => {
    for (const cell of NORTH_CELLS) {
      for (const [x, y] of pointsOf(cell)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(NORTH_SIZE);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(NORTH_SIZE);
      }
    }
  });

  it("кендры — ромбы, остальные дома — треугольники", () => {
    // 1, 4, 7, 10 стоят по центрам сторон и имеют четыре угла.
    for (const cell of NORTH_CELLS) {
      const corners = pointsOf(cell).length;
      const isKendra = [1, 4, 7, 10].includes(cell.bhava);
      expect(corners).toBe(isKendra ? 4 : 3);
    }
  });

  it("первый дом стоит наверху по центру — в этом весь стиль", () => {
    const first = NORTH_CELLS[0];
    expect(first.labelX).toBe(NORTH_SIZE / 2);
    expect(first.labelY).toBeLessThan(NORTH_SIZE / 4);
  });

  it("седьмой дом — напротив первого, внизу", () => {
    const seventh = NORTH_CELLS[6];
    expect(seventh.labelX).toBe(NORTH_SIZE / 2);
    expect(seventh.labelY).toBeGreaterThan((NORTH_SIZE * 3) / 4);
  });

  it("подписи всех домов лежат внутри квадрата", () => {
    for (const cell of NORTH_CELLS) {
      expect(cell.labelX).toBeGreaterThan(0);
      expect(cell.labelX).toBeLessThan(NORTH_SIZE);
      expect(cell.grahaY).toBeGreaterThan(0);
      expect(cell.grahaY).toBeLessThan(NORTH_SIZE);
    }
  });
});

describe("NORTH_LINES", () => {
  it("делят квадрат двумя диагоналями и ромбом", () => {
    expect(NORTH_LINES).toHaveLength(3);
    expect(NORTH_LINES[2]).toMatch(/Z$/);
  });
});

describe("rashiOfBhava", () => {
  it("первый дом — знак лагны", () => {
    expect(rashiOfBhava(1, 7)).toBe(7);
  });

  it("дальше идёт по кругу зодиака", () => {
    expect(rashiOfBhava(2, 7)).toBe(8);
    expect(rashiOfBhava(6, 7)).toBe(12);
  });

  it("замыкает круг после двенадцатого знака", () => {
    expect(rashiOfBhava(7, 7)).toBe(1);
    expect(rashiOfBhava(12, 7)).toBe(6);
  });

  it("для любой лагны даёт все двенадцать знаков без повторов", () => {
    for (let lagna = 1; lagna <= 12; lagna += 1) {
      const signs = Array.from({ length: 12 }, (_, i) =>
        rashiOfBhava(i + 1, lagna as 1),
      );
      expect(new Set(signs).size).toBe(12);
    }
  });
});

describe("grahasByBhava", () => {
  const graha = (name: string, bhava: number | null) =>
    ({ graha: name, bhava }) as unknown as GrahaPosition;

  const chart = (grahas: GrahaPosition[]) => ({ grahas }) as VedicChart;

  it("заводит все двенадцать домов, даже пустые — они рисуются", () => {
    expect(grahasByBhava(chart([])).size).toBe(12);
  });

  it("раскладывает грахи по их бхаве", () => {
    const map = grahasByBhava(
      chart([graha("sun", 11), graha("moon", 6), graha("mars", 11)]),
    );
    expect(map.get(11)!.map((g) => g.graha)).toEqual(["sun", "mars"]);
    expect(map.get(6)!).toHaveLength(1);
    expect(map.get(1)!).toHaveLength(0);
  });

  it("пропускает грахи без бхавы — при неизвестном времени домов нет", () => {
    const map = grahasByBhava(chart([graha("sun", null)]));
    expect([...map.values()].flat()).toHaveLength(0);
  });
});
