import type { WellnessVerdictResult } from "@vedamatch/shared";
import { reasonSummary, verdictLook } from "./verdict-labels";

/**
 * Ответ у полки. Вердикт не кодируется одним цветом: рядом всегда значок и
 * слово, иначе человек с дальтонизмом прочитает «можно» вместо «нельзя».
 */
const ACCENT: Record<string, string> = {
  magenta: "border-magenta text-magenta",
  cyan: "border-cyan text-cyan",
  gold: "border-gold text-gold",
  "text-1": "border-glass-brd text-text-1",
};

export function VerdictCard({ result }: { result: WellnessVerdictResult }) {
  const look = verdictLook(result.verdict);
  const accent = ACCENT[look.accent] ?? ACCENT["text-1"];

  return (
    <section className="rounded-2xl border border-glass-brd bg-glass p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-mono text-lg ${accent}`}
        >
          {look.glyph}
        </span>
        <div className="min-w-0">
          <p className={`font-display text-lg font-bold ${accent.split(" ")[1]}`}>
            {look.label}
          </p>
          <p className="mt-0.5 text-sm text-text-1">{look.hint}</p>
        </div>
      </div>

      {result.reasons.length > 0 && (
        <ul className="mt-4 space-y-2">
          {result.reasons.map((reason) => (
            <li
              key={`${reason.ingredient.key}-${reason.matchedText}`}
              className="rounded-xl border border-glass-brd px-3 py-2"
            >
              <p className="text-sm font-medium text-text-0">
                {reason.ingredient.name}
                {reason.severity === "mayContain" && " — может содержаться"}
                {reason.severity === "hidden" && " — может прятаться в составе"}
              </p>
              <p className="mt-0.5 font-mono text-xs text-text-2">
                на этикетке: {reason.matchedText}
              </p>
              {reason.ingredient.note && (
                <p className="mt-1 text-xs text-text-1">
                  {reason.ingredient.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {result.unrecognized.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-text-1">
            Не разобрано: {result.unrecognized.length}
          </summary>
          <p className="mt-2 text-xs text-text-2">
            {result.unrecognized.join(", ")}
          </p>
          <p className="mt-2 text-xs text-text-1">
            Этих слов нет в нашем справочнике. Если что-то из них важно —
            напишите нам, и мы добавим.
          </p>
        </details>
      )}

      <p className="mt-4 border-t border-glass-brd pt-3 text-xs text-text-2">
        {reasonSummary(result.reasons, result.unrecognized.length)}
      </p>
    </section>
  );
}
