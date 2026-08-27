import type { GrahaPosition, RashiIndex, VedicChart } from "@vedamatch/shared";

/**
 * Раскладка северноиндийской карты — ромба.
 *
 * Устроена ровно наоборот южной: здесь закреплены ДОМА, а знаки двигаются.
 * Первый дом всегда наверху по центру, дальше против часовой стрелки. Поэтому
 * привыкший к стилю читает не «где Меша», а «что в первом доме», и подпись в
 * клетке — номер знака, а не его имя.
 *
 * Отсюда же следует главное ограничение: без времени рождения нет лагны, а без
 * лагны нет домов — и ромб рисовать нечем. Южная карта в этом случае остаётся,
 * северная честно уступает место объяснению.
 */

/** Сторона квадрата в координатах viewBox. */
export const NORTH_SIZE = 400;

const HALF = NORTH_SIZE / 2;
const QUARTER = NORTH_SIZE / 4;

export interface NorthCell {
  /** Номер дома, 1..12. */
  bhava: number;
  /** Контур клетки для `points` у polygon. */
  points: string;
  /** Куда ставить номер знака. */
  labelX: number;
  labelY: number;
  /** Откуда выкладывать грахи вниз столбиком. */
  grahaX: number;
  grahaY: number;
}

/**
 * Двенадцать клеток ромба. Квадрат делят обе диагонали и ромб по серединам
 * сторон; получаются четыре ромбовидные клетки по центрам сторон (дома 1, 4, 7,
 * 10 — кендры) и восемь треугольников по углам.
 *
 * Координаты заданы явным списком, а не выведены формулой: формула для
 * двенадцати несимметричных фигур вышла бы длиннее списка и куда хуже читалась
 * бы при правке.
 */
const CELLS: ReadonlyArray<Omit<NorthCell, "bhava">> = [
  // 1 — верхний центр
  { points: `${HALF},0 ${HALF + QUARTER},${QUARTER} ${HALF},${HALF} ${QUARTER},${QUARTER}`, labelX: HALF, labelY: 22, grahaX: HALF, grahaY: 60 },
  // 2 — верхний левый угол
  { points: `0,0 ${HALF},0 ${QUARTER},${QUARTER}`, labelX: QUARTER, labelY: 18, grahaX: QUARTER, grahaY: 46 },
  // 3 — левый верхний
  { points: `0,0 ${QUARTER},${QUARTER} 0,${HALF}`, labelX: 22, labelY: HALF - QUARTER + 6, grahaX: 34, grahaY: HALF - QUARTER + 34 },
  // 4 — левый центр
  { points: `0,${HALF} ${QUARTER},${QUARTER} ${HALF},${HALF} ${QUARTER},${HALF + QUARTER}`, labelX: QUARTER, labelY: HALF - 26, grahaX: QUARTER, grahaY: HALF + 6 },
  // 5 — левый нижний
  { points: `0,${HALF} ${QUARTER},${HALF + QUARTER} 0,${NORTH_SIZE}`, labelX: 22, labelY: HALF + QUARTER - 6, grahaX: 34, grahaY: HALF + QUARTER + 22 },
  // 6 — нижний левый угол
  { points: `0,${NORTH_SIZE} ${QUARTER},${HALF + QUARTER} ${HALF},${NORTH_SIZE}`, labelX: QUARTER, labelY: NORTH_SIZE - 8, grahaX: QUARTER, grahaY: NORTH_SIZE - 34 },
  // 7 — нижний центр
  { points: `${HALF},${NORTH_SIZE} ${HALF + QUARTER},${HALF + QUARTER} ${HALF},${HALF} ${QUARTER},${HALF + QUARTER}`, labelX: HALF, labelY: NORTH_SIZE - 22, grahaX: HALF, grahaY: HALF + 40 },
  // 8 — нижний правый угол
  { points: `${HALF},${NORTH_SIZE} ${HALF + QUARTER},${HALF + QUARTER} ${NORTH_SIZE},${NORTH_SIZE}`, labelX: HALF + QUARTER, labelY: NORTH_SIZE - 8, grahaX: HALF + QUARTER, grahaY: NORTH_SIZE - 34 },
  // 9 — правый нижний
  { points: `${NORTH_SIZE},${NORTH_SIZE} ${HALF + QUARTER},${HALF + QUARTER} ${NORTH_SIZE},${HALF}`, labelX: NORTH_SIZE - 22, labelY: HALF + QUARTER - 6, grahaX: NORTH_SIZE - 34, grahaY: HALF + QUARTER + 22 },
  // 10 — правый центр
  { points: `${NORTH_SIZE},${HALF} ${HALF + QUARTER},${HALF + QUARTER} ${HALF},${HALF} ${HALF + QUARTER},${QUARTER}`, labelX: HALF + QUARTER, labelY: HALF - 26, grahaX: HALF + QUARTER, grahaY: HALF + 6 },
  // 11 — правый верхний
  { points: `${NORTH_SIZE},${HALF} ${HALF + QUARTER},${QUARTER} ${NORTH_SIZE},0`, labelX: NORTH_SIZE - 22, labelY: HALF - QUARTER + 6, grahaX: NORTH_SIZE - 34, grahaY: HALF - QUARTER + 34 },
  // 12 — верхний правый угол
  { points: `${NORTH_SIZE},0 ${HALF + QUARTER},${QUARTER} ${HALF},0`, labelX: HALF + QUARTER, labelY: 18, grahaX: HALF + QUARTER, grahaY: 46 },
];

export const NORTH_CELLS: ReadonlyArray<NorthCell> = CELLS.map((cell, index) => ({
  ...cell,
  bhava: index + 1,
}));

/** Линии, которые делят квадрат: обе диагонали и ромб по серединам сторон. */
export const NORTH_LINES: ReadonlyArray<string> = [
  `M 0 0 L ${NORTH_SIZE} ${NORTH_SIZE}`,
  `M ${NORTH_SIZE} 0 L 0 ${NORTH_SIZE}`,
  `M ${HALF} 0 L ${NORTH_SIZE} ${HALF} L ${HALF} ${NORTH_SIZE} L 0 ${HALF} Z`,
];

/** Знак, стоящий в доме: первый дом — лагна, дальше по кругу зодиака. */
export function rashiOfBhava(
  bhava: number,
  lagnaRashi: RashiIndex,
): RashiIndex {
  return (((lagnaRashi - 1 + bhava - 1) % 12) + 1) as RashiIndex;
}

/**
 * Грахи по домам. Раскладывается по `bhava` самой грахи, а не пересчитывается
 * из знака: в карте бхава уже посчитана сервером, и второй расчёт рядом однажды
 * разойдётся с первым.
 */
export function grahasByBhava(chart: VedicChart): Map<number, GrahaPosition[]> {
  const map = new Map<number, GrahaPosition[]>();
  for (let bhava = 1; bhava <= 12; bhava += 1) map.set(bhava, []);
  for (const graha of chart.grahas) {
    if (graha.bhava === null) continue;
    map.get(graha.bhava)?.push(graha);
  }
  return map;
}
