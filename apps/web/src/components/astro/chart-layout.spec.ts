import { describe, expect, it } from "vitest";
import type { GrahaPosition, VedicChart } from "@vedamatch/shared";
import {
  CHART_CELLS,
  CHART_GRID_SIZE,
  bhavaOf,
  cellOf,
  grahasByRashi,
} from "./chart-layout";
import { formatDegrees } from "./chart-wheel";
import { formatPeriodDate } from "./dasha-panel";

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

describe("раскладка южноиндийской карты", () => {
  it("содержит ровно двенадцать знаков", () => {
    expect(CHART_CELLS).toHaveLength(12);
    expect(new Set(CHART_CELLS.map((c) => c.rashi)).size).toBe(12);
  });

  it("все клетки лежат по периметру сетки, центр остаётся пустым", () => {
    for (const cell of CHART_CELLS) {
      const onEdge =
        cell.row === 0 ||
        cell.column === 0 ||
        cell.row === CHART_GRID_SIZE - 1 ||
        cell.column === CHART_GRID_SIZE - 1;
      expect(onEdge).toBe(true);
    }
  });

  it("ни одна клетка не занята дважды", () => {
    const keys = CHART_CELLS.map((c) => `${c.row}:${c.column}`);
    expect(new Set(keys).size).toBe(12);
  });

  it("знаки идут подряд по часовой стрелке без разрывов", () => {
    // Соседние знаки должны стоять в соседних клетках: смещение ровно на одну
    // позицию по строке или столбцу, иначе обход где-то перескакивает.
    for (let rashi = 1; rashi <= 12; rashi++) {
      const current = cellOf(rashi);
      const next = cellOf((rashi % 12) + 1);
      const distance =
        Math.abs(current.row - next.row) + Math.abs(current.column - next.column);
      expect(distance).toBe(1);
    }
  });

  it("Меша, Карка, Тула и Макара стоят в углах обхода", () => {
    expect(cellOf(1)).toMatchObject({ row: 0, column: 1 });
    expect(cellOf(4)).toMatchObject({ row: 1, column: 3 });
    expect(cellOf(7)).toMatchObject({ row: 3, column: 2 });
    expect(cellOf(10)).toMatchObject({ row: 2, column: 0 });
  });
});

describe("распределение грах по знакам", () => {
  const chart = {
    grahas: [
      graha({ graha: "sun", rashi: 1 }),
      graha({ graha: "moon", rashi: 7 }),
      graha({ graha: "mars", rashi: 1 }),
    ],
  } as VedicChart;

  it("сохраняет пустые знаки: их клетки всё равно рисуются", () => {
    const map = grahasByRashi(chart);
    expect(map.size).toBe(12);
    expect(map.get(5)).toEqual([]);
  });

  it("собирает несколько грах в одном знаке", () => {
    expect(grahasByRashi(chart).get(1)!.map((g) => g.graha)).toEqual([
      "sun",
      "mars",
    ]);
  });
});

describe("номера бхав в клетках", () => {
  it("знак лагны получает первый дом", () => {
    expect(bhavaOf(5, 5)).toBe(1);
  });

  it("счёт заворачивается через конец зодиака", () => {
    expect(bhavaOf(1, 12)).toBe(2);
  });

  it("без лагны номера домов не выдаются", () => {
    // Иначе при неизвестном времени рождения в карте появились бы выдуманные дома.
    expect(bhavaOf(5, null)).toBeNull();
  });
});

describe("форматирование", () => {
  it("градусы показываются с минутами", () => {
    expect(formatDegrees(23.669)).toBe("23°40′");
    expect(formatDegrees(0)).toBe("0°00′");
  });

  it("минуты дополняются нулём", () => {
    expect(formatDegrees(8.05)).toBe("8°03′");
  });

  it("даты периодов показываются календарно", () => {
    expect(formatPeriodDate("2019-04-29T00:00:00.000Z")).toBe("29.04.2019");
  });
});
