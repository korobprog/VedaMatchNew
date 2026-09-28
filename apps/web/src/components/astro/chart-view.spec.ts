import { describe, expect, it } from "vitest";
import type {
  GrahaPosition,
  TransitGrahaPosition,
  VedicChart,
} from "@vedamatch/shared";
import {
  bhavaFrom,
  buildChartView,
  degreeInVarga,
  navamsaRashiOf,
  northCenterLabel,
  packPlacementLines,
  placementsByBhava,
  placementsByRashi,
  type ChartPlacement,
} from "./chart-view";

const graha = (overrides: Partial<GrahaPosition>): GrahaPosition => ({
  graha: "sun",
  longitude: 0,
  degreeInRashi: 0,
  rashi: 1,
  nakshatra: 1,
  pada: 1,
  navamsaRashi: 1,
  bhava: 1,
  retrograde: false,
  combust: false,
  ...overrides,
});

/**
 * Лагна Вришабха 16°11′ (46.19°), Солнце Меша 27°10′ (дом 12), Луна Тула 5°
 * (185°, дом 6), Сатурн Вришчика ретро (дом 7). Навамши посчитаны тем же
 * правилом, что на сервере.
 */
const chart = (overrides: Partial<VedicChart> = {}): VedicChart =>
  ({
    bornAtUtc: "1987-05-12T02:20:00.000Z",
    timeAccuracy: "exact",
    ayanamsa: 23.669,
    lagna: { longitude: 46.19, rashi: 2, nakshatra: 4, pada: 1 },
    grahas: [
      graha({
        graha: "sun",
        longitude: 27.17,
        degreeInRashi: 27.17,
        rashi: 1,
        navamsaRashi: 9,
        bhava: 12,
      }),
      graha({
        graha: "moon",
        longitude: 185,
        degreeInRashi: 5,
        rashi: 7,
        navamsaRashi: 8,
        bhava: 6,
      }),
      graha({
        graha: "saturn",
        longitude: 225,
        degreeInRashi: 15,
        rashi: 8,
        navamsaRashi: 8,
        bhava: 7,
        retrograde: true,
      }),
    ],
    moonNakshatra: 15,
    dasha: null,
    fingerprint: "test",
    engineVersion: "test",
    ...overrides,
  }) as VedicChart;

const transit = (
  overrides: Partial<TransitGrahaPosition>,
): TransitGrahaPosition => ({
  graha: "jupiter",
  longitude: 95,
  degreeInRashi: 5,
  rashi: 4,
  nakshatra: 8,
  navamsaRashi: 2,
  retrograde: false,
  ...overrides,
});

describe("navamsaRashiOf", () => {
  it("огненный знак начинает навамшу с Меши, земной — с Макары", () => {
    expect(navamsaRashiOf(0)).toBe(1); // Меша 0° → Меша
    expect(navamsaRashiOf(30)).toBe(10); // Вришабха 0° → Макара
    expect(navamsaRashiOf(60)).toBe(7); // Митхуна 0° → Тула
    expect(navamsaRashiOf(90)).toBe(4); // Карка 0° → Карка
  });

  it("не проваливается на ровной границе навамши в 10°", () => {
    // 10 / (30 / 9) даёт 2.999…, и наивная формула вернула бы третью навамшу.
    expect(navamsaRashiOf(10)).toBe(4);
    expect(navamsaRashiOf(20)).toBe(7);
  });

  it("совпадает с навамшами тестовой карты", () => {
    for (const g of chart().grahas) {
      expect(navamsaRashiOf(g.longitude)).toBe(g.navamsaRashi);
    }
  });

  it("принимает долготы вне [0, 360)", () => {
    expect(navamsaRashiOf(360)).toBe(1);
    expect(navamsaRashiOf(-1)).toBe(navamsaRashiOf(359));
  });
});

describe("degreeInVarga", () => {
  it("в D1 — градусы внутри знака", () => {
    expect(degreeInVarga(46.19, "d1")).toBeCloseTo(16.19, 9);
  });

  it("в D9 навамша растягивается в целый знак", () => {
    // 3°20′ натальной долготы = 30° навамши.
    expect(degreeInVarga(0, "d9")).toBe(0);
    expect(degreeInVarga(1, "d9")).toBeCloseTo(9, 9);
    expect(degreeInVarga(5, "d9")).toBeCloseTo(15, 9);
  });

  it("всегда в [0, 30)", () => {
    for (let lon = 0; lon < 360; lon += 7.3) {
      for (const varga of ["d1", "d9"] as const) {
        const deg = degreeInVarga(lon, varga);
        expect(deg).toBeGreaterThanOrEqual(0);
        expect(deg).toBeLessThan(30);
      }
    }
  });
});

describe("bhavaFrom", () => {
  it("знак первого дома — дом 1, дальше по зодиаку с заворотом", () => {
    expect(bhavaFrom(5, 5)).toBe(1);
    expect(bhavaFrom(6, 5)).toBe(2);
    expect(bhavaFrom(4, 5)).toBe(12);
    expect(bhavaFrom(1, 12)).toBe(2);
  });
});

describe("buildChartView", () => {
  it("по умолчанию — натальная D1 от лагны, как карта была всегда", () => {
    const view = buildChartView(chart());
    expect(view.varga).toBe("d1");
    expect(view.reference).toBe("lagna");
    expect(view.firstRashi).toBe(2);
    expect(view.placements.every((p) => !p.transit)).toBe(true);
  });

  it("дома от лагны в D1 совпадают с бхавами, посчитанными сервером", () => {
    const view = buildChartView(chart());
    for (const g of chart().grahas) {
      const placement = view.placements.find(
        (p) => p.key === `natal-${g.graha}`,
      )!;
      expect(bhavaFrom(placement.rashi, view.firstRashi!)).toBe(g.bhava);
    }
  });

  it("в D9 ставит грахи в знаки навамши, а первым домом — навамшу лагны", () => {
    const view = buildChartView(chart(), {
      varga: "d9",
      reference: "lagna",
      transits: null,
    });
    // Лагна 46.19° — Вришабха 16°11′, пятая навамша от Макары — снова
    // Вришабха (варготтама).
    expect(view.firstRashi).toBe(2);
    const sun = view.placements.find((p) => p.key === "natal-sun")!;
    expect(sun.rashi).toBe(9);
    expect(sun.degree).toBeCloseTo((27.17 * 9) % 30, 9);
  });

  it("от Луны первым домом становится знак натальной Луны", () => {
    const view = buildChartView(chart(), {
      varga: "d1",
      reference: "moon",
      transits: null,
    });
    expect(view.firstRashi).toBe(7);
    const byBhava = placementsByBhava(view);
    expect(byBhava.get(1)!.map((p) => p.graha)).toEqual(["moon"]);
    // Лагна перестаёт быть первым домом и ставится в клетку подписью.
    const lagna = view.placements.find((p) => p.graha === "lagna")!;
    expect(lagna.abbr).toBe("Лг");
    expect(lagna.rashi).toBe(2);
    expect(bhavaFrom(lagna.rashi, view.firstRashi!)).toBe(8);
  });

  it("от Луны в D9 первый дом — навамша Луны", () => {
    const view = buildChartView(chart(), {
      varga: "d9",
      reference: "moon",
      transits: null,
    });
    expect(view.firstRashi).toBe(8);
  });

  it("при отсчёте от лагны отдельной подписи «Лг» нет", () => {
    const view = buildChartView(chart());
    expect(view.placements.some((p) => p.graha === "lagna")).toBe(false);
  });

  it("без времени рождения от лагны домов нет, а от Луны — есть", () => {
    const noTime = chart({ lagna: null, timeAccuracy: "unknown" });
    expect(buildChartView(noTime).firstRashi).toBeNull();
    const fromMoon = buildChartView(noTime, {
      varga: "d1",
      reference: "moon",
      transits: null,
    });
    expect(fromMoon.firstRashi).toBe(7);
    expect(fromMoon.placements.some((p) => p.graha === "lagna")).toBe(false);
  });

  it("добавляет транзиты отдельными позициями поверх натальных", () => {
    const view = buildChartView(chart(), {
      varga: "d1",
      reference: "lagna",
      transits: [transit({}), transit({ graha: "sun", rashi: 6 })],
    });
    const transits = view.placements.filter((p) => p.transit);
    expect(transits.map((p) => p.key)).toEqual([
      "transit-jupiter",
      "transit-sun",
    ]);
    // Натальное и транзитное Солнце — разные позиции с разными ключами.
    expect(view.placements.filter((p) => p.graha === "sun")).toHaveLength(2);
    expect(transits[0].rashi).toBe(4);
    expect(transits[0].degree).toBe(5);
  });

  it("в D9 транзит встаёт в свою навамшу", () => {
    const view = buildChartView(chart(), {
      varga: "d9",
      reference: "lagna",
      transits: [transit({ longitude: 95, navamsaRashi: 2 })],
    });
    const jupiter = view.placements.find((p) => p.key === "transit-jupiter")!;
    expect(jupiter.rashi).toBe(2);
    expect(jupiter.degree).toBeCloseTo((95 * 9) % 30, 9);
  });
});

describe("placementsByRashi / placementsByBhava", () => {
  it("заводят все двенадцать клеток, даже пустые — они рисуются", () => {
    const view = buildChartView(chart());
    expect(placementsByRashi(view).size).toBe(12);
    expect(placementsByBhava(view).size).toBe(12);
    expect(placementsByRashi(view).get(5)).toEqual([]);
  });

  it("без первого дома домов нет вовсе", () => {
    const view = buildChartView(chart({ lagna: null }));
    expect(placementsByBhava(view).size).toBe(0);
    // Знаки при этом остаются — южная карта рисуется.
    expect(
      placementsByRashi(view)
        .get(1)!
        .map((p) => p.graha),
    ).toEqual(["sun"]);
  });
});

describe("packPlacementLines", () => {
  const items = (n: number): ChartPlacement[] =>
    Array.from({ length: n }, (_, i) => ({
      key: `k${i}`,
      graha: "sun",
      abbr: "Су",
      rashi: 1,
      degree: i,
      retrograde: false,
      transit: false,
    }));

  it("пока помещается — по одной грахе в строку с градусами", () => {
    const lines = packPlacementLines(items(3), 3);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.items.length === 1 && l.withDegrees)).toBe(
      true,
    );
  });

  it("когда не помещается — по две в строку без градусов", () => {
    const lines = packPlacementLines(items(5), 3);
    expect(lines.map((l) => l.items.length)).toEqual([2, 2, 1]);
    expect(lines.every((l) => !l.withDegrees)).toBe(true);
  });

  it("ничего не теряет", () => {
    for (let n = 0; n <= 18; n += 1) {
      const lines = packPlacementLines(items(n), 5);
      expect(lines.flatMap((l) => l.items)).toHaveLength(n);
    }
  });
});

describe("northCenterLabel", () => {
  it("у натальной D1 от лагны — аянамша, по ней карту сверяют", () => {
    expect(northCenterLabel(buildChartView(chart()), 23.669)).toMatch(
      /^аянамша 23°40′/,
    );
  });

  it("в остальных видах — коротко, что показано", () => {
    const view = (varga: "d1" | "d9", reference: "lagna" | "moon") =>
      buildChartView(chart(), { varga, reference, transits: null });
    expect(northCenterLabel(view("d9", "lagna"), 23.669)).toBe("D9 · от лагны");
    expect(northCenterLabel(view("d1", "moon"), 23.669)).toBe("D1 · от Луны");
    expect(northCenterLabel(view("d9", "moon"), 23.669)).toBe("D9 · от Луны");
  });
});
