"use client";

import { useState } from "react";
import {
  IntentionConstructor,
  type IntentionWeights,
} from "./intention-constructor";
import {
  IntentionPicker,
  evenWeights,
  isEvenSplit,
  selectedTypes,
} from "./intention-picker";
import { intentionTypes } from "./labels";

/**
 * Галочки — обычный режим, проценты — по желанию. Анкета с ручными весами
 * открывается сразу в процентах: иначе первое же касание галочек стёрло бы
 * настройку, которую человек делал руками.
 */
export function IntentionSection({
  weights,
  onChange,
}: {
  weights: IntentionWeights;
  onChange: (weights: IntentionWeights) => void;
}) {
  const [fineTuning, setFineTuning] = useState(() => !isEvenSplit(weights));

  function toggleMode(next: boolean) {
    setFineTuning(next);
    if (next) return;
    // Возврат к галочкам выравнивает веса: набор целей сохраняется, а вот
    // приоритеты внутри него — нет, о чём написано рядом с переключателем.
    const selected = selectedTypes(weights);
    onChange(evenWeights(selected.length > 0 ? selected : intentionTypes));
  }

  return (
    <div className="space-y-3">
      {fineTuning ? (
        <IntentionConstructor weights={weights} onChange={onChange} />
      ) : (
        <IntentionPicker weights={weights} onChange={onChange} />
      )}
      <label className="flex items-start gap-3 text-sm text-text-1">
        <input
          type="checkbox"
          checked={fineTuning}
          onChange={(event) => toggleMode(event.target.checked)}
          className="mt-0.5 h-5 w-5"
        />
        <span>
          Тонкая настройка: распределить 100% между целями
          <span className="block text-xs text-text-2">
            При выключении проценты выровняются поровну между отмеченными
            целями.
          </span>
        </span>
      </label>
    </div>
  );
}
