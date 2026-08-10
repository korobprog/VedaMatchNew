import {
  GRAHA_NAMES,
  NAKSHATRA_NAMES,
  RASHI_NAMES,
  type VedicChart,
} from "@vedamatch/shared";
import { formatDegrees } from "./chart-wheel";

/**
 * Таблица положений — то, по чему карту сверяют с другой программой. Поэтому здесь
 * градусы с минутами, а не округления: расхождение в четверть градуса должно быть
 * видно, а не спрятано.
 */
export function GrahaTable({ chart }: { chart: VedicChart }) {
  const showBhava = chart.lagna !== null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/15 text-left dark:border-white/20">
            <th className="py-2 pr-3 font-medium">Граха</th>
            <th className="py-2 pr-3 font-medium">Знак</th>
            <th className="py-2 pr-3 text-right font-medium">Градус</th>
            {showBhava && (
              <th className="py-2 pr-3 text-right font-medium">Бхава</th>
            )}
            <th className="py-2 pr-3 font-medium">Накшатра</th>
            <th className="py-2 pr-3 text-right font-medium">Пада</th>
            <th className="py-2 font-medium">D9</th>
          </tr>
        </thead>
        <tbody>
          {chart.grahas.map((graha) => (
            <tr
              key={graha.graha}
              className="border-b border-black/[0.07] dark:border-white/10"
            >
              <td className="py-2 pr-3">
                {GRAHA_NAMES[graha.graha]}
                {graha.retrograde && (
                  <span
                    className="ml-1 text-black/50 dark:text-white/50"
                    title="Ретроградное движение"
                  >
                    R
                  </span>
                )}
                {graha.combust && (
                  <span
                    className="ml-1 text-amber-700 dark:text-amber-400"
                    title="Астангата — сожжение близостью к Солнцу"
                  >
                    ☉
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">{RASHI_NAMES[graha.rashi - 1]}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatDegrees(graha.degreeInRashi)}
              </td>
              {showBhava && (
                <td className="py-2 pr-3 text-right tabular-nums">
                  {graha.bhava}
                </td>
              )}
              <td className="py-2 pr-3">
                {NAKSHATRA_NAMES[graha.nakshatra - 1]}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {graha.pada}
              </td>
              <td className="py-2">{RASHI_NAMES[graha.navamsaRashi - 1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
