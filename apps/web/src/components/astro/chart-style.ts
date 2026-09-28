/**
 * Стиль отображения карты: южноиндийский квадрат или северноиндийский ромб.
 *
 * Расчёт один, различается только способ смотреть, поэтому выбор — дело
 * привычки человека, а не свойство карты. Он запоминается на устройстве
 * (localStorage), как плотность сетки в Union и ряд кнопок в Motivation:
 * настройка косметическая, заводить под неё поле в базе незачем.
 */
export type ChartStyle = "south" | "north";

export const CHART_STYLE_STORAGE_KEY = "astro.chart.style";

export const DEFAULT_CHART_STYLE: ChartStyle = "south";

export const CHART_STYLE_LABELS: Readonly<Record<ChartStyle, string>> = {
  south: "Южный",
  north: "Северный",
};

/** Чужое или испорченное значение в хранилище не должно ломать страницу. */
export function parseChartStyle(raw: string | null): ChartStyle {
  return raw === "north" ? "north" : DEFAULT_CHART_STYLE;
}

/**
 * Какой стиль рисовать на самом деле. Северная карта — это сетка домов, а
 * дома считаются от первого дома; когда отсчитывать не от чего (нет времени
 * рождения — нет лагны), ромб честно уступает место южной карте, а выбор
 * человека при этом не перезаписывается.
 */
export function effectiveChartStyle(
  chosen: ChartStyle,
  hasFirstHouse: boolean,
): ChartStyle {
  return chosen === "north" && !hasFirstHouse ? "south" : chosen;
}
