import {
  GRAHA_ABBR,
  RASHI_NAMES,
  type VedicChart,
} from "@vedamatch/shared";
import { CHART_CELLS, bhavaOf, grahasByRashi } from "./chart-layout";

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

export function ChartWheel({ chart }: { chart: VedicChart }) {
  const byRashi = grahasByRashi(chart);
  const lagnaRashi = chart.lagna?.rashi ?? null;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-md text-black dark:text-white"
      role="img"
      aria-label="Ведическая карта рождения, южноиндийский стиль"
    >
      {CHART_CELLS.map((cell) => {
        const x = cell.column * CELL;
        const y = cell.row * CELL;
        const grahas = byRashi.get(cell.rashi)!;
        const bhava = bhavaOf(cell.rashi, lagnaRashi);
        const isLagna = cell.rashi === lagnaRashi;

        return (
          <g key={cell.rashi}>
            <rect
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeWidth={1}
            />

            {/* Лагна выделяется диагональю в углу — так её метят в традиции. */}
            {isLagna && (
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
              fillOpacity={0.55}
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
                fillOpacity={0.4}
              >
                {bhava}
              </text>
            )}

            {grahas.map((graha, index) => (
              <text
                key={graha.graha}
                x={x + 8}
                y={y + 34 + index * 13}
                fontSize={11}
                fill="currentColor"
              >
                {GRAHA_ABBR[graha.graha]}
                <tspan fontSize={9} fillOpacity={0.6}>
                  {" "}
                  {Math.floor(graha.degreeInRashi)}°
                  {graha.retrograde ? " R" : ""}
                </tspan>
              </text>
            ))}
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
        fillOpacity={0.55}
      >
        Раши D1
      </text>
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 12}
        fontSize={10}
        textAnchor="middle"
        fill="currentColor"
        fillOpacity={0.4}
      >
        аянамша {formatDegrees(chart.ayanamsa)}
      </text>
    </svg>
  );
}

/** Градусы в привычный астрологу вид: 23°40′. */
export function formatDegrees(value: number): string {
  const degrees = Math.floor(value);
  const minutes = Math.floor((value - degrees) * 60);
  return `${degrees}°${String(minutes).padStart(2, "0")}′`;
}
