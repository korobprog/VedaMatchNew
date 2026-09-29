"use client";

import { useEffect, useState } from "react";
import {
  GRAHA_NAMES,
  RASHI_NAMES,
  type AstroTransitPositionsDto,
  type VedicChart,
} from "@vedamatch/shared";
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
import {
  REFERENCE_LABELS,
  VARGA_LABELS,
  bhavaFrom,
  buildChartView,
  type ChartReference,
  type ChartVarga,
} from "./chart-view";

const STYLES: ReadonlyArray<ChartStyle> = ["south", "north"];
const VARGAS: ReadonlyArray<ChartVarga> = ["d1", "d9"];
const REFERENCES: ReadonlyArray<ChartReference> = ["lagna", "moon"];

/**
 * Момент транзита для подписи. В UTC намеренно: страница рендерится на
 * сервере, и местное время сервера разошлось бы с браузерным при гидратации.
 */
const TRANSIT_MOMENT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function Segmented<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<T>;
  labels: Readonly<Record<T, string>>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-1 rounded-xl border border-glass-brd p-1"
    >
      {options.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={[
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            value === key
              ? "bg-glass text-text-0"
              : "text-text-2 hover:text-text-0",
          ].join(" ")}
        >
          {labels[key]}
        </button>
      ))}
    </div>
  );
}

/**
 * Карта рождения с переключателями: стиль «Южный / Северный», варга D1 / D9,
 * отсчёт домов от лагны или от Луны и транзиты поверх натальных грах.
 *
 * Раньше обе карты стояли друг под другом, и на телефоне вторая уезжала за
 * экран, хотя смотрит человек всегда в одну — ту, к которой привык. Стиль
 * запоминается на устройстве; варга, отсчёт и транзиты — выбор на один
 * взгляд, и каждый раз страница открывается натальной D1 от лагны.
 *
 * `transits` — небо на момент открытия страницы. null — расчёт недоступен,
 * и переключатель транзитов не показывается.
 */
export function ChartPanel({
  chart,
  transits = null,
  initialTransits = false,
}: {
  chart: VedicChart;
  transits?: AstroTransitPositionsDto | null;
  /** Сразу с транзитами — с горячей кнопки «Транзиты» (VED-659). */
  initialTransits?: boolean;
}) {
  const [chosen, setChosen] = useState<ChartStyle>(DEFAULT_CHART_STYLE);
  const [varga, setVarga] = useState<ChartVarga>("d1");
  const [reference, setReference] = useState<ChartReference>("lagna");
  const [showTransits, setShowTransits] = useState(initialTransits);

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

  function chooseStyle(next: ChartStyle) {
    setChosen(next);
    try {
      window.localStorage.setItem(CHART_STYLE_STORAGE_KEY, next);
    } catch {
      // Приватный режим: выбор живёт до конца сессии.
    }
  }

  const view = buildChartView(chart, {
    varga,
    reference,
    transits: showTransits && transits ? transits.grahas : null,
  });
  const style = effectiveChartStyle(chosen, view.firstRashi !== null);
  const transitPlacements = view.placements.filter((p) => p.transit);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Segmented
          label="Стиль карты"
          options={STYLES}
          labels={CHART_STYLE_LABELS}
          value={chosen}
          onChange={chooseStyle}
        />
        <Segmented
          label="Варга"
          options={VARGAS}
          labels={{ d1: "D1", d9: "D9" }}
          value={varga}
          onChange={setVarga}
        />
        <Segmented
          label="Отсчёт домов"
          options={REFERENCES}
          labels={REFERENCE_LABELS}
          value={reference}
          onChange={setReference}
        />
        {transits && (
          <button
            type="button"
            onClick={() => setShowTransits((value) => !value)}
            aria-pressed={showTransits}
            className={[
              "rounded-xl border border-glass-brd px-3 py-1.5 text-xs font-semibold transition-colors",
              showTransits
                ? "bg-glass text-text-0"
                : "text-text-2 hover:text-text-0",
            ].join(" ")}
          >
            Транзиты
          </button>
        )}
      </div>

      <figure>
        {style === "north" ? (
          <ChartWheelNorth chart={chart} view={view} />
        ) : (
          <ChartWheel chart={chart} view={view} />
        )}
        <figcaption className="mt-2 text-xs text-text-2">
          {style === "north"
            ? "Северноиндийская: дома закреплены, первый наверху, знак в клетке — числом"
            : "Южноиндийская: знаки закреплены, дома подписаны числом"}
          {" · "}
          {VARGA_LABELS[varga]}
          {reference === "moon" &&
            " · дома от Луны: первый дом — знак натальной Луны"}
        </figcaption>
      </figure>

      {chosen === "north" && style !== "north" && (
        <p className="mt-2 text-xs text-text-2">
          Северноиндийская карта строится по домам, а дома считаются от лагны —
          для неё нужно время рождения. Пока показана южная; ромб можно
          построить от Луны.
        </p>
      )}

      {showTransits && transits && (
        <div className="mt-3 text-xs text-text-2">
          <p>
            <span className="font-semibold italic text-cyan">
              Курсив цветом
            </span>{" "}
            — транзиты на {TRANSIT_MOMENT.format(new Date(transits.at))} UTC,
            прямым шрифтом — карта рождения.
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {transitPlacements.map((placement) => (
              <li key={placement.key}>
                <span className="text-text-0">
                  {GRAHA_NAMES[placement.graha as keyof typeof GRAHA_NAMES]}
                </span>{" "}
                {RASHI_NAMES[placement.rashi - 1]}{" "}
                {Math.floor(placement.degree)}°
                {placement.retrograde ? " R" : ""}
                {view.firstRashi !== null &&
                  `, дом ${bhavaFrom(placement.rashi, view.firstRashi)}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
