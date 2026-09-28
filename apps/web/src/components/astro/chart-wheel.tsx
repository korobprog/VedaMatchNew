import { RASHI_NAMES, type VedicChart } from "@vedamatch/shared";
import { formatDegrees } from "@/lib/astro-degrees";
import { CHART_CELLS, bhavaOf } from "./chart-layout";
import {
  CHART_LABEL_OPACITY,
  CHART_LINE_OPACITY,
  PlacementLines,
} from "./chart-placements";
import {
  VARGA_LABELS,
  buildChartView,
  packPlacementLines,
  placementsByRashi,
  type ChartView,
} from "./chart-view";

// Формат градусов живёт в lib: им же пользуется карточка на главной.
export { formatDegrees };

/**
 * Южноиндийская карта на чистом SVG, без библиотек: сетка 4×4 с закреплёнными
 * знаками — это прямоугольники и текст, рисовать их нечем больше не нужно.
 *
 * viewBox фиксирован, размер задаётся снаружи через CSS, поэтому карта одинаково
 * читается и на телефоне, и на десктопе. Цвета берутся из currentColor, чтобы тема
 * переключалась без второго набора стилей.
 */

const CELL = 100;
const SIZE = CELL * 4;

// Доли прозрачности живут рядом с подписями грах: ими пользуются обе сетки.
export { CHART_LABEL_OPACITY, CHART_LINE_OPACITY };

/** Столько грах помещается в клетку столбиком с градусами. */
const MAX_SINGLE_LINES = 5;

/**
 * `view` — что рисовать: варга, отсчёт домов, транзиты. Без него рисуется
 * натальная D1 от лагны — как карта выглядела всегда.
 */
export function ChartWheel({
  chart,
  view = buildChartView(chart),
}: {
  chart: VedicChart;
  view?: ChartView;
}) {
  const byRashi = placementsByRashi(view);
  const firstRashi = view.firstRashi;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-md text-text-0"
      role="img"
      aria-label={`Ведическая карта рождения, южноиндийский стиль, ${VARGA_LABELS[view.varga]}`}
    >
      {CHART_CELLS.map((cell) => {
        const x = cell.column * CELL;
        const y = cell.row * CELL;
        const placements = byRashi.get(cell.rashi)!;
        const bhava = bhavaOf(cell.rashi, firstRashi);
        const isFirst = cell.rashi === firstRashi;

        return (
          <g key={cell.rashi}>
            <rect
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              fill="none"
              stroke="currentColor"
              strokeOpacity={CHART_LINE_OPACITY}
              strokeWidth={1}
            />

            {/* Первый дом выделяется диагональю в углу — так метят лагну в
                традиции; при отсчёте от Луны так же метится Чандра-лагна. */}
            {isFirst && (
              <path
                d={`M ${x} ${y + 22} L ${x + 22} ${y}`}
                stroke="currentColor"
                strokeWidth={2}
                fill="none"
              />
            )}

            <text
              x={x + 6}
              y={y + 14}
              fontSize={9}
              fill="currentColor"
              fillOpacity={CHART_LABEL_OPACITY}
            >
              {RASHI_NAMES[cell.rashi - 1]}
            </text>

            {bhava !== null && (
              <text
                x={x + CELL - 6}
                y={y + 14}
                fontSize={9}
                textAnchor="end"
                fill="currentColor"
                fillOpacity={CHART_LABEL_OPACITY}
              >
                {bhava}
              </text>
            )}

            <PlacementLines
              lines={packPlacementLines(placements, MAX_SINGLE_LINES)}
              x={x + 8}
              y={y + 34}
            />
          </g>
        );
      })}

      {/* Центр карты: аянамша и стиль — то, что отличает эту карту от чужой. */}
      <text
        x={SIZE / 2}
        y={SIZE / 2 - 6}
        fontSize={11}
        textAnchor="middle"
        fill="currentColor"
        fillOpacity={CHART_LABEL_OPACITY}
      >
        {VARGA_LABELS[view.varga]}
      </text>
      {view.reference === "moon" && (
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 28}
          fontSize={10}
          textAnchor="middle"
          fill="currentColor"
          fillOpacity={CHART_LABEL_OPACITY}
        >
          от Луны
        </text>
      )}
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 12}
        fontSize={10}
        textAnchor="middle"
        fill="currentColor"
        fillOpacity={CHART_LABEL_OPACITY}
      >
        аянамша {formatDegrees(chart.ayanamsa)}
      </text>
    </svg>
  );
}
