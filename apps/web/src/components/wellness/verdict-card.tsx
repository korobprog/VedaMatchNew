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

      {result.hidden.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-text-1">
            Состав не договаривает: {result.hidden.length}
          </summary>
          <ul className="mt-2 space-y-1">
            {result.hidden.map((reason) => (
              <li key={reason.matchedText} className="text-xs text-text-1">
                <span className="font-mono text-text-2">
                  {reason.matchedText}
                </span>
                {reason.ingredient.note && ` — ${reason.ingredient.note}`}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-text-1">
            Такие формулировки производитель не расшифровывает: под ними может
            быть и лук, и животное сырьё.
          </p>
        </details>
      )}

      {result.unrecognized.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-text-1">
            Незнакомые слова: {result.unrecognized.length}
          </summary>
          <p className="mt-2 text-xs text-text-2">
            {result.unrecognized.join(", ")}
          </p>
          <p className="mt-2 text-xs text-text-1">
            Их нет в нашем справочнике. Если что-то из них важно — напишите
            нам, и мы добавим.
          </p>
        </details>
      )}

      <p className="mt-4 border-t border-glass-brd pt-3 text-xs text-text-2">
        {reasonSummary(
          result.reasons,
          result.unrecognized.length + result.hidden.length,
        )}
      </p>
    </section>
  );
}
