import type { GrahaPosition, RashiIndex, VedicChart } from "@vedamatch/shared";

/**
 * Раскладка южноиндийской карты.
 *
 * Знаки закреплены за клетками и никогда не двигаются — в этом весь смысл стиля:
 * человек, привыкший к нему, находит нужный знак не читая подписей. Двигаются только
 * планеты. Двенадцать знаков занимают периметр сетки 4×4, центр 2×2 остаётся пустым.
 *
 * Порядок обхода — по часовой стрелке от Меши в верхнем ряду. Северноиндийский ромб
 * устроен иначе (там закреплены дома, а знаки двигаются) и в бету не входит.
 */

export interface ChartCell {
  rashi: RashiIndex;
  row: number;
  column: number;
}

export const CHART_GRID_SIZE = 4;

/** Индекс — раши минус единица. */
const CELL_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // Меша
  [0, 2], // Вришабха
  [0, 3], // Митхуна
  [1, 3], // Карка
  [2, 3], // Симха
  [3, 3], // Канья
  [3, 2], // Тула
  [3, 1], // Вришчика
  [3, 0], // Дхану
  [2, 0], // Макара
  [1, 0], // Кумбха
  [0, 0], // Мина
];

export const CHART_CELLS: ReadonlyArray<ChartCell> = CELL_POSITIONS.map(
  ([row, column], index) => ({ rashi: index + 1, row, column }),
);

/** Клетка знака. */
export function cellOf(rashi: RashiIndex): ChartCell {
  return CHART_CELLS[rashi - 1];
}

/** Грахи, стоящие в каждом знаке. Пустые знаки в карте тоже нужны — они рисуются. */
export function grahasByRashi(
  chart: VedicChart,
): Map<RashiIndex, GrahaPosition[]> {
  const map = new Map<RashiIndex, GrahaPosition[]>();
  for (const cell of CHART_CELLS) map.set(cell.rashi, []);
  for (const graha of chart.grahas) {
    map.get(graha.rashi)!.push(graha);
  }
  return map;
}

/**
 * Номер бхавы для клетки. Возвращает null, когда лагны нет: рисовать номера домов
 * при неизвестном времени рождения нельзя, они были бы выдуманы.
 */
export function bhavaOf(
  rashi: RashiIndex,
  lagnaRashi: RashiIndex | null,
): number | null {
  if (lagnaRashi === null) return null;
  return ((rashi - lagnaRashi + 12) % 12) + 1;
}
