"use client";

import { useEffect, useState } from "react";
import type { VedicChart } from "@vedamatch/shared";
import { ChartWheel } from "./chart-wheel";
import { ChartWheelNorth } from "./chart-wheel-north";
import {
  CHART_STYLE_LABELS,
  CHART_STYLE_STORAGE_KEY,
  DEFAULT_CHART_STYLE,
  effectiveChartStyle,
  parseChartStyle,
  type ChartStyle,
} from "./chart-style";

const STYLES: ReadonlyArray<ChartStyle> = ["south", "north"];

/**
 * Карта рождения с переключателем стиля «Южный / Северный».
 *
 * Раньше обе карты стояли друг под другом, и на телефоне вторая уезжала за
 * экран, хотя смотрит человек всегда в одну — ту, к которой привык. Теперь
 * карта одна, а стиль выбирается и запоминается на устройстве.
 */
export function ChartPanel({ chart }: { chart: VedicChart }) {
  const [chosen, setChosen] = useState<ChartStyle>(DEFAULT_CHART_STYLE);

  /* Читаем эффектом: на сервере `localStorage` нет, и ленивый `useState` дал
     бы расхождение гидратации. Так же устроены настройки ленты Motivation. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше. */
    try {
      setChosen(
        parseChartStyle(window.localStorage.getItem(CHART_STYLE_STORAGE_KEY)),
      );
    } catch {
      // Хранилище недоступно — остаёмся на стиле по умолчанию.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function choose(next: ChartStyle) {
    setChosen(next);
    try {
      window.localStorage.setItem(CHART_STYLE_STORAGE_KEY, next);
    } catch {
      // Приватный режим: выбор живёт до конца сессии.
    }
  }

  const hasLagna = chart.lagna !== null;
  const style = effectiveChartStyle(chosen, hasLagna);

  return (
    <div>
      <div
        role="group"
        aria-label="Стиль карты"
        className="mb-3 inline-flex gap-1 rounded-xl border border-glass-brd p-1"
      >
        {STYLES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => choose(key)}
            aria-pressed={chosen === key}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              chosen === key
                ? "bg-glass text-text-0"
                : "text-text-2 hover:text-text-0",
            ].join(" ")}
          >
            {CHART_STYLE_LABELS[key]}
          </button>
        ))}
      </div>

      <figure>
        {style === "north" ? (
          <ChartWheelNorth chart={chart} />
        ) : (
          <ChartWheel chart={chart} />
        )}
        <figcaption className="mt-2 text-xs text-text-2">
          {style === "north"
            ? "Северноиндийская: дома закреплены, первый наверху, знак в клетке — числом"
            : "Южноиндийская: знаки закреплены, дома подписаны числом"}
        </figcaption>
      </figure>

      {chosen === "north" && !hasLagna && (
        <p className="mt-2 text-xs text-text-2">
          Северноиндийская карта строится по домам, а дома считаются от лагны —
          для неё нужно время рождения. Пока показана южная.
        </p>
      )}
    </div>
  );
}
