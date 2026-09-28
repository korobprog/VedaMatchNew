import type { ChartPlacement, PlacementLine } from "./chart-view";

/**
 * Подписи грах в клетке — общие для южной и северной сетки.
 *
 * Натальная граха — цветом текста, транзитная — курсивом и акцентом
 * --vm-cyan: курсив различает их и без цвета, цвет — с одного взгляда.
 * Градусы у транзита без прозрачности: --vm-cyan мелким текстом на
 * --vm-bg-0 и так стоит у порога 4.5:1, полупрозрачный он бы его не прошёл.
 */

export const CHART_LINE_HEIGHT = 13;

/**
 * Прозрачность линий и подписей карты. Числа не на глаз: цвет здесь —
 * `currentColor`, то есть --vm-text-0, и на светлой теме прежние 0.35 и 0.4
 * давали 2.25:1 и 2.58:1 — ниже порогов WCAG (3:1 для графики, 4.5:1 для
 * мелкого текста). Карта на светлой теме читалась с трудом.
 *
 * 0.5 даёт линиям 3.46:1, 0.62 подписям — 5.11:1. На тёмной теме те же доли
 * только добавляют контраста: там текст светлый на тёмном фоне.
 */
export const CHART_LINE_OPACITY = 0.5;
export const CHART_LABEL_OPACITY = 0.62;

function PlacementTspan({
  placement,
  withDegrees,
  leading,
}: {
  placement: ChartPlacement;
  withDegrees: boolean;
  leading: boolean;
}) {
  const transitProps = placement.transit
    ? { fill: "var(--vm-cyan)", fontStyle: "italic" as const }
    : {};
  return (
    <tspan
      {...transitProps}
      dx={leading ? undefined : 5}
      data-transit={placement.transit || undefined}
    >
      {placement.abbr}
      {withDegrees && (
        <tspan
          fontSize={9}
          fillOpacity={placement.transit ? undefined : CHART_LABEL_OPACITY}
        >
          {" "}
          {Math.floor(placement.degree)}°{placement.retrograde ? " R" : ""}
        </tspan>
      )}
      {!withDegrees && placement.retrograde && <tspan fontSize={9}>R</tspan>}
    </tspan>
  );
}

export function PlacementLines({
  lines,
  x,
  y,
  anchor = "start",
}: {
  lines: ReadonlyArray<PlacementLine>;
  x: number;
  y: number;
  anchor?: "start" | "middle";
}) {
  return (
    <>
      {lines.map((line, index) => (
        <text
          key={line.items.map((item) => item.key).join("|")}
          x={x}
          y={y + index * CHART_LINE_HEIGHT}
          fontSize={11}
          textAnchor={anchor}
          fill="currentColor"
        >
          {line.items.map((item, itemIndex) => (
            <PlacementTspan
              key={item.key}
              placement={item}
              withDegrees={line.withDegrees}
              leading={itemIndex === 0}
            />
          ))}
        </text>
      ))}
    </>
  );
}
