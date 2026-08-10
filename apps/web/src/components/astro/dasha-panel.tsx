import { GRAHA_NAMES, type DashaPeriod, type DashaState } from "@vedamatch/shared";

/** `2019-04-29` → `29.04.2019`. Даты периодов читают как календарные, не как метки. */
export function formatPeriodDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function PeriodRow({
  period,
  current,
}: {
  period: DashaPeriod;
  current: boolean;
}) {
  return (
    <li
      className={
        current
          ? "flex justify-between gap-4 rounded-lg bg-amber-500/15 px-3 py-2"
          : "flex justify-between gap-4 px-3 py-2"
      }
    >
      <span className={current ? "font-medium" : undefined}>
        {GRAHA_NAMES[period.lord]}
      </span>
      <span className="tabular-nums text-black/60 dark:text-white/60">
        {formatPeriodDate(period.startsAt)} — {formatPeriodDate(period.endsAt)}
      </span>
    </li>
  );
}

/**
 * Даши. Показываются целиком, а не только текущая: смысл периодов виден лишь в
 * последовательности, а текущий выделен фоном.
 */
export function DashaPanel({ dasha }: { dasha: DashaState }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60">
          Махадаши
        </h3>
        <ul className="mt-2 text-sm">
          {dasha.mahadashas.map((period) => (
            <PeriodRow
              key={period.startsAt}
              period={period}
              current={period.startsAt === dasha.currentMahadasha.startsAt}
            />
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60">
          Антардаши внутри {GRAHA_NAMES[dasha.currentMahadasha.lord]}
        </h3>
        <ul className="mt-2 text-sm">
          {dasha.antardashas.map((period) => (
            <PeriodRow
              key={period.startsAt}
              period={period}
              current={period.startsAt === dasha.currentAntardasha.startsAt}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
