"use client";

import { useEffect, useRef, useState } from "react";
import type { UnionIntentionCounts, UnionIntentionType } from "@vedamatch/shared";
import { intentionLabels, intentionTypes } from "./labels";

const chipClass =
  "rounded-full border px-3 py-1.5 text-sm transition cursor-pointer";
const activeChip = "border-magenta bg-magenta/15 text-text-0";
const idleChip = "border-glass-brd text-text-1 hover:text-text-0";

/**
 * Цели выбираются несколькими сразу (ИЛИ).
 *
 * «Все» — не пятая категория и не просто сброс целей: это «показать всех».
 * Раньше он снимал фильтр целей, а лента при этом продолжала молча прятать
 * уже отсмотренных, желаемый возраст партнёра из анкеты и пол под целью
 * «Создание семьи» — человек читал «Все · 4» и искал остальных восьмерых в
 * фильтрах, где их не было. Теперь кнопка снимает всё, что сужает выдачу
 * молча — и моё, и чужое, — и подсвечена ровно тогда, когда режим включён.
 * Остаются только фильтры экрана: пол, этап, город, радиус и прочее, что
 * человек выбрал сам и видит рядом.
 */
export function IntentionChips({
  counts,
  selected,
  showAll,
}: {
  counts: UnionIntentionCounts;
  selected: UnionIntentionType[];
  /** Режим «показать всех» уже включён — тогда чип горит и знает своё число. */
  showAll: boolean;
}) {
  const [chosen, setChosen] = useState<UnionIntentionType[]>(selected);
  const [everyone, setEveryone] = useState(showAll);
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
  }, [chosen, everyone]);

  function toggle(type: UnionIntentionType) {
    // Выбор конкретной цели — уже сужение, и «показать всех» ему противоречит.
    setEveryone(false);
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
        {/* Значение уходит на сервер только во включённом состоянии: пустое
            поле в GET-запросе оставило бы в ссылке `showAll=` без смысла. */}
        {everyone && <input type="hidden" name="showAll" value="true" />}
        <button
          type="button"
          onClick={() => {
            setChosen([]);
            setEveryone(true);
          }}
          aria-pressed={everyone}
          className={`${chipClass} ${everyone ? activeChip : idleChip}`}
        >
          {/*
            Пока режим выключен, числа на кнопке нет намеренно: counts.all
            считается по текущей выдаче и показал бы то самое «Все · 4»,
            из-за которого и завёлся весь разговор. Обещать число, которого
            человек не увидит, хуже, чем не обещать никакого.
          */}
          {everyone ? `Все · ${counts.all}` : "Показать всех"}
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
