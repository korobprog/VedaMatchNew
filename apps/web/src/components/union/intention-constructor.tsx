"use client";

import type { UnionIntentionType } from "@vedamatch/shared";
import { intentionLabels, intentionTypes } from "./labels";

export type IntentionWeights = Record<UnionIntentionType, number>;

export function intentionSum(weights: IntentionWeights): number {
  return intentionTypes.reduce((sum, type) => sum + weights[type], 0);
}

/** Пропорционально приводит веса к сумме 100. */
export function normalizeWeights(weights: IntentionWeights): IntentionWeights {
  const sum = intentionSum(weights);
  if (sum === 0) return { family: 25, business: 25, friendship: 25, service: 25 };
  const normalized = intentionTypes.map((type) => ({
    type,
    weight: Math.floor((weights[type] / sum) * 100),
  }));
  let remainder = 100 - normalized.reduce((s, i) => s + i.weight, 0);
  for (const item of normalized) {
    if (remainder === 0) break;
    if (item.weight > 0 || intentionSum(weights) === 0) {
      item.weight += 1;
      remainder -= 1;
    }
  }
  // если остаток не разошёлся по ненулевым — отдаём первому
  if (remainder > 0) normalized[0].weight += remainder;
  return Object.fromEntries(normalized.map((i) => [i.type, i.weight])) as IntentionWeights;
}

export function IntentionConstructor({
  weights,
  onChange,
}: {
  weights: IntentionWeights;
  onChange: (weights: IntentionWeights) => void;
}) {
  const sum = intentionSum(weights);
  const sumOk = sum === 100;

  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Что вы ищете? Распределите 100% между направлениями
      </legend>
      {intentionTypes.map((type) => (
        <div key={type}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <label htmlFor={`intention-${type}`} className="text-zinc-700 dark:text-zinc-300">
              {intentionLabels[type]}
            </label>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {weights[type]}%
            </span>
          </div>
          <input
            id={`intention-${type}`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={weights[type]}
            onChange={(e) =>
              onChange({ ...weights, [type]: Number(e.target.value) })
            }
            className="w-full accent-amber-600"
          />
        </div>
      ))}
      <div className="flex items-center justify-between text-sm">
        <span className={sumOk ? "text-emerald-600" : "text-red-600"}>
          Сумма: {sum}% {sumOk ? "✓" : "(должна быть 100%)"}
        </span>
        {!sumOk && (
          <button
            type="button"
            onClick={() => onChange(normalizeWeights(weights))}
            className="rounded-lg border border-amber-600 px-3 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
          >
            Выровнять до 100%
          </button>
        )}
      </div>
    </fieldset>
  );
}
