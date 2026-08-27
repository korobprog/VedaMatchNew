import { GRAHA_ABBR, type VedicChart } from "@vedamatch/shared";
import {
  NORTH_CELLS,
  NORTH_LINES,
  NORTH_SIZE,
  grahasByBhava,
  rashiOfBhava,
} from "./chart-layout-north";
import {
  CHART_LABEL_OPACITY,
  CHART_LINE_OPACITY,
  formatDegrees,
} from "./chart-wheel";

/**
 * Северноиндийская карта — ромб. Тот же расчёт, другой способ смотреть:
 * здесь закреплены дома, а знаки двигаются, и первый дом всегда наверху.
 *
 * Рисуется рядом с южной, а не вместо неё: школы читают по-разному, и
 * заставлять человека переучиваться ради нашего выбора незачем.
 *
 * Без лагны не рисуется вовсе — возвращает null. Дома в этом стиле и есть
 * сетка, а без времени рождения их не существует; нарисовать пустой ромб
 * значило бы показать двенадцать выдуманных клеток.
 */
export function ChartWheelNorth({ chart }: { chart: VedicChart }) {
  const lagnaRashi = chart.lagna?.rashi ?? null;
  if (lagnaRashi === null) return null;

  const byBhava = grahasByBhava(chart);

  return (
    <svg
      viewBox={`0 0 ${NORTH_SIZE} ${NORTH_SIZE}`}
      className="w-full max-w-md text-text-0"
      role="img"
      aria-label="Ведическая карта рождения, северноиндийский стиль"
    >
      <rect
        x={0}
        y={0}
        width={NORTH_SIZE}
        height={NORTH_SIZE}
        fill="none"
        stroke="currentColor"
        strokeOpacity={CHART_LINE_OPACITY}
        strokeWidth={1}
      />
      {NORTH_LINES.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeOpacity={CHART_LINE_OPACITY}
          strokeWidth={1}
        />
      ))}

      {NORTH_CELLS.map((cell) => {
        const rashi = rashiOfBhava(cell.bhava, lagnaRashi);
        const grahas = byBhava.get(cell.bhava)!;

        return (
          <g key={cell.bhava}>
            {/* Номер знака, а не имя: в этом стиле клетку узнают по дому, а
                знак читают числом — так его пишут и от руки. */}
            <text
              x={cell.labelX}
              y={cell.labelY}
              fontSize={10}
              textAnchor="middle"
              fill="currentColor"
              fillOpacity={CHART_LABEL_OPACITY}
            >
              {rashi}
            </text>

            {grahas.map((graha, index) => (
              <text
                key={graha.graha}
                x={cell.grahaX}
                y={cell.grahaY + index * 13}
                fontSize={11}
                textAnchor="middle"
                fill="currentColor"
              >
                {GRAHA_ABBR[graha.graha]}
                <tspan fontSize={9} fillOpacity={CHART_LABEL_OPACITY}>
                  {" "}
                  {Math.floor(graha.degreeInRashi)}°{graha.retrograde ? " R" : ""}
                </tspan>
              </text>
            ))}
          </g>
        );
      })}

      <text
        x={NORTH_SIZE / 2}
        y={NORTH_SIZE / 2 + 4}
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
