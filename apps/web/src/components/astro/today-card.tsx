import { GRAHA_NAMES, NAKSHATRA_NAMES, RASHI_NAMES } from "@vedamatch/shared";
import type { AstroTodayDto } from "@vedamatch/shared";

/**
 * Персональный день. Факты (знак, накшатра, бхава транзитной Луны) есть всегда;
 * текста может не быть — фраза общая на весь портал и генерируется по мере
 * того, как в течение дня появляются новые бхавы, а не сразу для всех.
 */
export function TodayCard({ today }: { today: AstroTodayDto }) {
  return (
    <section className="rounded-2xl border border-glass-brd p-4">
      <h2 className="text-sm font-medium text-text-2">
        Персональный день
      </h2>

      {today.text ? (
        <p className="mt-2 text-base leading-relaxed">{today.text}</p>
      ) : (
        <p className="mt-2 text-sm text-text-2">
          Луна сегодня в {RASHI_NAMES[today.moonRashi - 1]}, {today.moonBhava}-й
          бхаве. Разбор дня появится чуть позже.
        </p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-2">
        <div className="flex gap-1">
          <dt>Луна:</dt>
          <dd>
            {RASHI_NAMES[today.moonRashi - 1]},{" "}
            {NAKSHATRA_NAMES[today.moonNakshatra - 1]}, {today.moonBhava}-я
            бхава
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Период:</dt>
          <dd>
            {GRAHA_NAMES[today.currentMahadasha.lord]} —{" "}
            {GRAHA_NAMES[today.currentAntardasha.lord]}
          </dd>
        </div>
      </dl>
    </section>
  );
}
