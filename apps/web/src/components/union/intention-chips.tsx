"use client";

import { useEffect, useRef, useState } from "react";
import type { UnionIntentionCounts, UnionIntentionType } from "@vedamatch/shared";
import { intentionLabels, intentionTypes } from "./labels";

const chipClass =
  "rounded-full border px-3 py-1.5 text-sm transition cursor-pointer";
const activeChip = "border-magenta bg-magenta/15 text-text-0";
const idleChip = "border-glass-brd text-text-1 hover:text-text-0";

/**
 * Цели выбираются несколькими сразу (ИЛИ). «Все» — не пятая категория, а
 * сброс именно целей: город, возраст и прочее он не трогает.
 */
export function IntentionChips({
  counts,
  selected,
}: {
  counts: UnionIntentionCounts;
  selected: UnionIntentionType[];
}) {
  const [chosen, setChosen] = useState<UnionIntentionType[]>(selected);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // Клик по чипу должен фильтровать карточки сразу, без отдельного нажатия
  // «Применить фильтры» — сабмитим форму автоматически при изменении выбора.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    containerRef.current?.closest("form")?.requestSubmit();
  }, [chosen]);

  function toggle(type: UnionIntentionType) {
    setChosen((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : // Порядок фиксирован, чтобы ссылка на выдачу не зависела от того,
          // в каком порядке человек нажимал чипы.
          intentionTypes.filter((item) => item === type || current.includes(item)),
    );
  }

  return (
    <div className="mb-3" ref={containerRef}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-2">
        Цель
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setChosen([])}
          aria-pressed={chosen.length === 0}
          className={`${chipClass} ${chosen.length === 0 ? activeChip : idleChip}`}
        >
          Все · {counts.all}
        </button>
        {intentionTypes.map((type) => (
          <label
            key={type}
            className={`${chipClass} ${chosen.includes(type) ? activeChip : idleChip}`}
          >
            <input
              type="checkbox"
              name="intentions"
              value={type}
              checked={chosen.includes(type)}
              onChange={() => toggle(type)}
              className="sr-only"
            />
            {intentionLabels[type]} · {counts[type]}
          </label>
        ))}
      </div>
    </div>
  );
}
