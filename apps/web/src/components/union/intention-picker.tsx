"use client";

import { useState } from "react";
import type { UnionIntentionType } from "@vedamatch/shared";
import type { IntentionWeights } from "./intention-constructor";
import { intentionLabels, intentionTypes } from "./labels";

const empty: IntentionWeights = {
  family: 0,
  business: 0,
  friendship: 0,
  service: 0,
};

/** Делит 100 поровну, остаток отдаёт первым по порядку целям: три цели дают
 *  34/33/33, а не 33/33/33 — сумма обязана быть ровно 100. */
export function evenWeights(selected: UnionIntentionType[]): IntentionWeights {
  if (selected.length === 0) return evenWeights(intentionTypes);
  const base = Math.floor(100 / selected.length);
  let remainder = 100 - base * selected.length;
  const weights: IntentionWeights = { ...empty };
  for (const type of intentionTypes) {
    if (!selected.includes(type)) continue;
    weights[type] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return weights;
}

export function selectedTypes(weights: IntentionWeights): UnionIntentionType[] {
  return intentionTypes.filter((type) => weights[type] > 0);
}

/** Ровно то, что получилось бы из галочек. Всё остальное — ручная настройка,
 *  которую нельзя молча потерять. */
export function isEvenSplit(weights: IntentionWeights): boolean {
  const selected = selectedTypes(weights);
  if (selected.length === 0) return false;
  const even = evenWeights(selected);
  return intentionTypes.every((type) => weights[type] === even[type]);
}

export function IntentionPicker({
  weights,
  onChange,
}: {
  weights: IntentionWeights;
  onChange: (weights: IntentionWeights) => void;
}) {
  const [warned, setWarned] = useState(false);
  const selected = selectedTypes(weights);

  function toggle(type: UnionIntentionType) {
    const next = selected.includes(type)
      ? selected.filter((item) => item !== type)
      : intentionTypes.filter((item) => item === type || selected.includes(item));
    // Сервер требует хотя бы одно намерение, поэтому пустой набор не
    // отправляем вовсе — иначе анкета молча перестала бы сохраняться.
    if (next.length === 0) {
      setWarned(true);
      return;
    }
    setWarned(false);
    onChange(evenWeights(next));
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold text-text-0">
        Что вы ищете? Отметьте подходящее
      </legend>
      {intentionTypes.map((type) => (
        <label key={type} className="flex items-center gap-3 text-sm text-text-1">
          <input
            type="checkbox"
            checked={selected.includes(type)}
            onChange={() => toggle(type)}
            className="h-5 w-5"
          />
          {intentionLabels[type]}
        </label>
      ))}
      {warned && (
        <p className="text-xs text-magenta">
          Оставьте хотя бы одну цель — без неё анкета не сохранится.
        </p>
      )}
    </fieldset>
  );
}
