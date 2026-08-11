"use client";

import { useState } from "react";
import type { Gender } from "@vedamatch/shared";
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

const seekLabels: Record<Gender, string> = {
  male: "мужчин",
  female: "женщин",
};

function oppositeGender(gender: Gender): Gender {
  return gender === "male" ? "female" : "male";
}

/**
 * Галочки — обычный режим, проценты — по желанию. Анкета с ручными весами
 * открывается сразу в процентах: иначе первое же касание галочек стёрло бы
 * настройку, которую человек делал руками.
 */
export function IntentionSection({
  weights,
  onChange,
  viewerGender = null,
  seeksGender = null,
  onSeeksGenderChange,
}: {
  weights: IntentionWeights;
  onChange: (weights: IntentionWeights) => void;
  viewerGender?: Gender | null;
  seeksGender?: Gender | null;
  onSeeksGenderChange?: (gender: Gender | null) => void;
}) {
  const [fineTuning, setFineTuning] = useState(() => !isEvenSplit(weights));
  const familyChosen = weights.family > 0;

  function toggleMode(next: boolean) {
    setFineTuning(next);
    if (next) return;
    // Возврат к галочкам выравнивает веса: набор целей сохраняется, а вот
    // приоритеты внутри него — нет, о чём написано рядом с переключателем.
    const selected = selectedTypes(weights);
    onChange(evenWeights(selected.length > 0 ? selected : intentionTypes));
  }

  function changeWeights(next: IntentionWeights) {
    onChange(next);
    if (!onSeeksGenderChange) return;
    // Семью ищут с человеком противоположного пола — предлагаем это сразу,
    // как только цель отмечена, но только один раз: снять галочку можно.
    if (next.family > 0 && !familyChosen && seeksGender === null && viewerGender) {
      onSeeksGenderChange(oppositeGender(viewerGender));
    }
    // Цель снята — выбор пола вместе с ней теряет смысл и больше ни на что
    // не влияет, но в анкете висел бы непонятным хвостом.
    if (next.family === 0 && familyChosen && seeksGender !== null) {
      onSeeksGenderChange(null);
    }
  }

  return (
    <div className="space-y-3">
      {fineTuning ? (
        <IntentionConstructor weights={weights} onChange={changeWeights} />
      ) : (
        <IntentionPicker weights={weights} onChange={changeWeights} />
      )}

      {familyChosen && onSeeksGenderChange && (
        <FamilyGenderChoice
          viewerGender={viewerGender}
          seeksGender={seeksGender}
          onChange={onSeeksGenderChange}
        />
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

/**
 * Пол известен из аккаунта — предлагаем одну галочку. Не известен — выбор
 * приходится делать руками: угадывать, кого ищет человек, мы не вправе.
 */
function FamilyGenderChoice({
  viewerGender,
  seeksGender,
  onChange,
}: {
  viewerGender: Gender | null;
  seeksGender: Gender | null;
  onChange: (gender: Gender | null) => void;
}) {
  const hint = (
    <span className="mt-1 block pl-8 text-xs text-text-2">
      Сужает и вашу ленту, и чужие: вы не попадёте к тем, кто ищет другой пол.
    </span>
  );

  if (viewerGender) {
    const target = oppositeGender(viewerGender);
    return (
      <div className="rounded-xl border border-glass-brd bg-bg-1 p-3">
        <label className="flex items-center gap-3 text-sm text-text-1">
          <input
            type="checkbox"
            checked={seeksGender === target}
            onChange={(event) => onChange(event.target.checked ? target : null)}
            className="h-5 w-5"
          />
          Искать только {seekLabels[target]}
        </label>
        {hint}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-glass-brd bg-bg-1 p-3">
      <label
        htmlFor="family-seeks-gender"
        className="mb-1 block text-sm text-text-1"
      >
        Кого искать для создания семьи
      </label>
      <select
        id="family-seeks-gender"
        value={seeksGender ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : (event.target.value as Gender))
        }
        className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 outline-none transition focus:border-magenta/50"
      >
        <option value="">Пол не важен</option>
        <option value="male">Только мужчин</option>
        <option value="female">Только женщин</option>
      </select>
      <span className="mt-1 block text-xs text-text-2">
        Пол в вашем аккаунте не указан, поэтому подставить его автоматически
        мы не можем.
      </span>
    </div>
  );
}
