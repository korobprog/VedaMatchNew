import type { PortalStatsPoint } from "@vedamatch/shared";

const MONTH_LABELS = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

/**
 * Столбики регистраций. Свой SVG, а не библиотека графиков: тут один ряд
 * без осей и подсказок, и тянуть ради него пакет в бандл незачем.
 *
 * Ряд приходит уже без пропусков — день без регистраций это ноль, а не
 * отсутствующая точка, иначе столбики врали бы про плотность.
 */
export function RegistrationsChart({
  points,
  granularity,
}: {
  points: PortalStatsPoint[];
  granularity: "day" | "month";
}) {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-text-2">
        За этот период регистраций не было.
      </p>
    );
  }

  const max = Math.max(...points.map((point) => point.count));

  return (
    <div>
      <ul className="flex h-32 items-end gap-[2px]" role="list">
        {points.map((point) => (
          <li
            key={point.period}
            className="group relative flex-1 rounded-t bg-cyan/30 transition-colors hover:bg-cyan/60"
            // Высота в процентах от максимума: столбик с одной регистрацией
            // всё равно видно, иначе график выглядит пустым.
            style={{ height: `${Math.max(4, (point.count / max) * 100)}%` }}
          >
            <span className="sr-only">
              {formatPeriod(point.period, granularity)}: {point.count}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-glass-brd bg-bg-1 px-2 py-1 text-xs text-text-0 group-hover:block"
            >
              {formatPeriod(point.period, granularity)}: {point.count}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between text-xs text-text-2">
        <span>{formatPeriod(points[0].period, granularity)}</span>
        <span>
          {formatPeriod(points[points.length - 1].period, granularity)}
        </span>
      </div>
    </div>
  );
}

/** `YYYY-MM-DD` → «21 авг», `YYYY-MM` → «авг 2026». */
function formatPeriod(period: string, granularity: "day" | "month"): string {
  const [year, month, day] = period.split("-");
  const monthLabel = MONTH_LABELS[Number(month) - 1] ?? month;
  return granularity === "day"
    ? `${Number(day)} ${monthLabel}`
    : `${monthLabel} ${year}`;
}
