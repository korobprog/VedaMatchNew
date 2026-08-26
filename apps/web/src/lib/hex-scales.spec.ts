import { describe, expect, it } from "vitest";
import {
  blendStops,
  edgeLighting,
  extrudedWalls,
  hexCenters,
  hexCorners,
  lightFalloff,
  parseHexColor,
  shimmer,
} from "./hex-scales";

describe("hexCenters", () => {
  it("покрывает прямоугольник с запасом за краями", () => {
    const cells = hexCenters(300, 200, 40);

    expect(cells.some((c) => c.x < 0)).toBe(true);
    expect(cells.some((c) => c.y < 0)).toBe(true);
    expect(cells.some((c) => c.x > 300)).toBe(true);
    expect(cells.some((c) => c.y > 200)).toBe(true);
  });

  it("опускает нечётные столбцы на половину шага — кладка «чешуёй»", () => {
    const cells = hexCenters(300, 200, 40);
    const step = 40 * Math.sqrt(3);
    const even = cells.find((c) => c.col === 0 && c.row === 0);
    const odd = cells.find((c) => c.col === 1 && c.row === 0);

    expect(even?.y).toBeCloseTo(0);
    expect(odd?.y).toBeCloseTo(step / 2);
  });

  it("ставит столбцы через три четверти ширины соты", () => {
    const cells = hexCenters(300, 200, 40);
    const first = cells.find((c) => c.col === 0 && c.row === 0);
    const second = cells.find((c) => c.col === 1 && c.row === 0);

    expect((second?.x ?? 0) - (first?.x ?? 0)).toBeCloseTo(60);
  });

  it.each([
    ["нулевом радиусе", 300, 200, 0],
    ["нулевой ширине", 0, 200, 40],
    ["нулевой высоте", 300, 0, 40],
  ])("возвращает пустую сетку при %s", (_case, w, h, r) => {
    expect(hexCenters(w, h, r)).toEqual([]);
  });
});

describe("hexCorners", () => {
  it("даёт шесть углов на радиусе от центра", () => {
    const corners = hexCorners(100, 100, 30);

    expect(corners).toHaveLength(6);
    for (const corner of corners) {
      const distance = Math.hypot(corner.x - 100, corner.y - 100);
      expect(distance).toBeCloseTo(30);
    }
  });
});

describe("shimmer", () => {
  it("не выходит за 0..1 на большом разбросе точек и времени", () => {
    for (let x = -500; x <= 2000; x += 137) {
      for (let y = -500; y <= 2000; y += 149) {
        for (const t of [0, 3.7, 60, 3600]) {
          const value = shimmer(x, y, t);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("меняется во времени — иначе чешуя стояла бы", () => {
    expect(shimmer(120, 80, 0)).not.toBeCloseTo(shimmer(120, 80, 5));
  });

  it("меняется по холсту — иначе весь фон мигал бы разом", () => {
    expect(shimmer(0, 0, 2)).not.toBeCloseTo(shimmer(400, 300, 2));
  });
});

describe("parseHexColor", () => {
  it("читает шестизначный цвет", () => {
    expect(parseHexColor("#FF3E9E")).toEqual([255, 62, 158]);
  });

  it("читает трёхзначный и терпит пробелы вокруг", () => {
    expect(parseHexColor("  #0f8  ")).toEqual([0, 255, 136]);
  });

  it.each(["", "не цвет", "#12345", "rgb(1,2,3)", "#GGGGGG"])(
    "возвращает null на «%s»",
    (value) => {
      expect(parseHexColor(value)).toBeNull();
    },
  );
});

describe("blendStops", () => {
  const stops: Array<[number, number, number]> = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ];

  it("отдаёт крайние цвета на краях диапазона", () => {
    expect(blendStops(stops, 0)).toEqual([255, 0, 0]);
    expect(blendStops(stops, 1)).toEqual([0, 0, 255]);
  });

  it("в середине попадает на средний цвет", () => {
    expect(blendStops(stops, 0.5)).toEqual([0, 255, 0]);
  });

  it("смешивает соседние цвета на четверти пути", () => {
    expect(blendStops(stops, 0.25)).toEqual([128, 128, 0]);
  });

  it("зажимает позицию за пределами 0..1", () => {
    expect(blendStops(stops, -3)).toEqual([255, 0, 0]);
    expect(blendStops(stops, 42)).toEqual([0, 0, 255]);
  });

  it("с одним цветом отдаёт его же", () => {
    expect(blendStops([[10, 20, 30]], 0.7)).toEqual([10, 20, 30]);
  });
});

describe("edgeLighting", () => {
  const corners = hexCorners(100, 100, 40);
  /** Пара точек грани по её порядковому номеру. */
  const edge = (i: number) => [corners[i], corners[(i + 1) % 6]] as const;

  it("грань, обращённая к свету, освещена сильнее противоположной", () => {
    // Свет далеко справа от соты.
    const lit = Math.max(
      ...[0, 1, 2, 3, 4, 5].map((i) =>
        edgeLighting(...edge(i), 100, 100, 900, 100),
      ),
    );
    const dark = Math.min(
      ...[0, 1, 2, 3, 4, 5].map((i) =>
        edgeLighting(...edge(i), 100, 100, 900, 100),
      ),
    );

    expect(lit).toBeGreaterThan(0.5);
    expect(dark).toBeLessThan(-0.5);
  });

  it("держится в пределах -1..1 для любой грани и любого света", () => {
    for (const [lx, ly] of [
      [0, 0],
      [100, 100],
      [-800, 400],
      [5000, -3000],
    ]) {
      for (let i = 0; i < 6; i += 1) {
        const value = edgeLighting(...edge(i), 100, 100, lx, ly);
        expect(value).toBeGreaterThanOrEqual(-1.0001);
        expect(value).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("свет ровно в середине грани не даёт направления", () => {
    const [a, b] = edge(0);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    expect(edgeLighting(a, b, 100, 100, midX, midY)).toBe(0);
  });
});

describe("lightFalloff", () => {
  it("в самой точке света — единица", () => {
    expect(lightFalloff(0, 0, 300)).toBe(1);
  });

  it("за радиусом — ноль", () => {
    expect(lightFalloff(300, 0, 300)).toBe(0);
    expect(lightFalloff(500, 500, 300)).toBe(0);
  });

  it("убывает с расстоянием", () => {
    const near = lightFalloff(50, 0, 300);
    const far = lightFalloff(200, 0, 300);

    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("нулевой радиус гасит свет, а не делит на ноль", () => {
    expect(lightFalloff(0, 0, 0)).toBe(0);
  });
});

describe("extrudedWalls", () => {
  const corners = hexCorners(100, 100, 40);

  it("показывает стенки только со стороны смещения", () => {
    // Торец уходит вправо — видны правые рёбра, левые скрыты плиткой.
    const walls = extrudedWalls(corners, 100, 100, 20, 0);

    expect(walls.length).toBeGreaterThan(0);
    expect(walls.length).toBeLessThan(6);
    for (const wall of walls) {
      const midX = (wall[0].x + wall[1].x) / 2;
      expect(midX).toBeGreaterThan(100);
    }
  });

  it("разворачивает набор стенок вслед за направлением", () => {
    const right = extrudedWalls(corners, 100, 100, 20, 0);
    const left = extrudedWalls(corners, 100, 100, -20, 0);

    const midOf = (walls: ReturnType<typeof extrudedWalls>) =>
      walls.map((w) => Math.round((w[0].x + w[1].x) / 2)).sort();
    expect(midOf(right)).not.toEqual(midOf(left));
    expect(left.every((w) => (w[0].x + w[1].x) / 2 < 100)).toBe(true);
  });

  it("строит стенку как ребро сверху и то же ребро, сдвинутое вниз", () => {
    const [wall] = extrudedWalls(corners, 100, 100, 0, 25);

    expect(wall).toHaveLength(4);
    expect(wall[3].x).toBeCloseTo(wall[0].x);
    expect(wall[3].y).toBeCloseTo(wall[0].y + 25);
    expect(wall[2].x).toBeCloseTo(wall[1].x);
    expect(wall[2].y).toBeCloseTo(wall[1].y + 25);
  });

  it("без смещения стенок нет — плитка лежит на фоне", () => {
    expect(extrudedWalls(corners, 100, 100, 0, 0)).toEqual([]);
  });
});
