import type { AstroCompleteness } from "@vedamatch/shared";
import { FEATURE_LABELS, FIELD_LABELS, nextStepHint } from "./astro-copy";

/**
 * Прогресс карты и то, что за ним стоит. Список открытого показывается всегда,
 * даже когда он короткий: человек должен видеть, что уже получил, а не только то,
 * чего ему не хватает.
 */
export function AstroProgress({
  completeness,
}: {
  completeness: AstroCompleteness;
}) {
  const unlocked = completeness.features.filter((f) => f.unlocked);
  const locked = completeness.features.filter((f) => !f.unlocked);
  const hint = nextStepHint(completeness);

  return (
    <section className="rounded-2xl border border-glass-brd p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">Карта готова</h2>
        <span className="text-2xl font-semibold tabular-nums">
          {completeness.percent}%
        </span>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-bg-2"
        role="progressbar"
        aria-valuenow={completeness.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Готовность карты"
      >
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-500"
          style={{ width: `${completeness.percent}%` }}
        />
      </div>

      {unlocked.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-text-2">
            Уже доступно
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {unlocked.map((feature) => (
              <li key={feature.key} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{FEATURE_LABELS[feature.key]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {locked.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-text-2">
            Откроется дальше
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-text-2">
            {locked.map((feature) => (
              <li key={feature.key} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>
                  {FEATURE_LABELS[feature.key]}
                  {" — нужно: "}
                  {feature.requires
                    .map((field) => FIELD_LABELS[field].toLowerCase())
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hint && (
        <p className="mt-5 text-sm text-text-1">
          {hint.reason}
        </p>
      )}
    </section>
  );
}
