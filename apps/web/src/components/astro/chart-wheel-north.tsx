import type { VedicChart } from "@vedamatch/shared";
import {
  NORTH_CELLS,
  NORTH_LINES,
  NORTH_SIZE,
  rashiOfBhava,
} from "./chart-layout-north";
import {
  CHART_LABEL_OPACITY,
  CHART_LINE_OPACITY,
  PlacementLines,
} from "./chart-placements";
import {
  VARGA_LABELS,
  buildChartView,
  northCenterLabel,
  packPlacementLines,
  placementsByBhava,
  type ChartView,
} from "./chart-view";

/**
 * Столько грах помещается в клетку ромба столбиком с градусами. Меньше, чем в
 * южной сетке: угловые треугольники сужаются книзу.
 */
const MAX_SINGLE_LINES = 3;

/**
 * Северноиндийская карта — ромб. Тот же расчёт, другой способ смотреть:
 * здесь закреплены дома, а знаки двигаются, и первый дом всегда наверху.
 *
 * Без первого дома не рисуется вовсе — возвращает null. Дома в этом стиле и
 * есть сетка; нарисовать ромб без отсчёта значило бы показать двенадцать
 * выдуманных клеток. Отсчёт даёт лагна (нужно время рождения) или Луна.
 */
export function ChartWheelNorth({
  chart,
  view = buildChartView(chart),
}: {
  chart: VedicChart;
  view?: ChartView;
}) {
  const firstRashi = view.firstRashi;
  if (firstRashi === null) return null;

  const byBhava = placementsByBhava(view);

  return (
    <svg
      viewBox={`0 0 ${NORTH_SIZE} ${NORTH_SIZE}`}
      className="w-full max-w-md text-text-0"
      role="img"
      aria-label={`Ведическая карта рождения, северноиндийский стиль, ${VARGA_LABELS[view.varga]}`}
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
        const rashi = rashiOfBhava(cell.bhava, firstRashi);
        const placements = byBhava.get(cell.bhava)!;

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

            <PlacementLines
              lines={packPlacementLines(placements, MAX_SINGLE_LINES)}
              x={cell.grahaX}
              y={cell.grahaY}
              anchor="middle"
            />
          </g>
        );
      })}

      {/* В центре — то, что отличает эту карту от соседней: аянамша для D1,
          название варги для D9 и отсчёт от Луны, когда он выбран. */}
      <text
        x={NORTH_SIZE / 2}
        y={NORTH_SIZE / 2 + 4}
        fontSize={10}
        textAnchor="middle"
        fill="currentColor"
        fillOpacity={CHART_LABEL_OPACITY}
      >
        {northCenterLabel(view, chart.ayanamsa)}
      </text>
    </svg>
  );
}
