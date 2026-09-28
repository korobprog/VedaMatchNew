import {
  GRAHA_ABBR,
  type GrahaId,
  type RashiIndex,
  type TransitGrahaPosition,
  type VedicChart,
} from "@vedamatch/shared";
import { formatDegrees } from "@/lib/astro-degrees";

/**
 * Что именно рисует карта: какая варга, от чего считаются дома и есть ли
 * поверх натальных грах транзитные.
 *
 * Сетки (южный квадрат и северный ромб) о джйотише не знают ничего: им дают
 * список «что стоит в каком знаке» и знак первого дома. Всё, что между
 * натальной картой с сервера и этим списком, — здесь, чистыми функциями.
 */

/** D1 — раши, сама карта рождения; D9 — навамша. */
export type ChartVarga = "d1" | "d9";

/** От чего считать первый дом: от лагны или от знака Луны (Чандра-лагна). */
export type ChartReference = "lagna" | "moon";

export const VARGA_LABELS: Readonly<Record<ChartVarga, string>> = {
  d1: "Раши D1",
  d9: "Навамша D9",
};

export const REFERENCE_LABELS: Readonly<Record<ChartReference, string>> = {
  lagna: "От лагны",
  moon: "От Луны",
};

export interface ChartPlacement {
  /** Уникален в пределах карты: натальное Солнце и транзитное — разные. */
  key: string;
  graha: GrahaId | "lagna";
  /** Подпись в клетке: сокращение грахи или «Лг». */
  abbr: string;
  /** Знак в выбранной варге. */
  rashi: RashiIndex;
  /** Градусы внутри знака этой варги, [0, 30). */
  degree: number;
  retrograde: boolean;
  /** Транзит поверх натальной карты — рисуется иначе и попадает в легенду. */
  transit: boolean;
}

export interface ChartView {
  varga: ChartVarga;
  reference: ChartReference;
  /** Знак первого дома. null — отсчитывать не от чего (нет лагны). */
  firstRashi: RashiIndex | null;
  placements: ChartPlacement[];
}

export interface ChartViewOptions {
  varga: ChartVarga;
  reference: ChartReference;
  /** Транзитные положения; null — транзиты не показываются. */
  transits: ReadonlyArray<TransitGrahaPosition> | null;
}

export const DEFAULT_VIEW_OPTIONS: ChartViewOptions = {
  varga: "d1",
  reference: "lagna",
  transits: null,
};

function normalize360(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

/**
 * Знак навамши по долготе. Нужен для лагны: у грах сервер присылает
 * `navamsaRashi` готовым, у лагны — только долготу. Формула та же, что на
 * сервере (vedic/rashi.ts): 108 навамш по кругу, умножение до деления, чтобы
 * граница ровно на 10° не округлилась вниз.
 */
export function navamsaRashiOf(longitude: number): RashiIndex {
  return (Math.floor((normalize360(longitude) * 108) / 360) % 12) + 1;
}

/**
 * Градусы внутри знака варги. В D9 навамша растягивается в целый знак: 3°20′
 * натальной долготы становятся 30° навамши, поэтому долгота умножается на 9.
 */
export function degreeInVarga(longitude: number, varga: ChartVarga): number {
  const scaled = normalize360(longitude) * (varga === "d9" ? 9 : 1);
  return scaled % 30;
}

/** Дом знака при отсчёте от `firstRashi`, 1..12 — по целым знакам. */
export function bhavaFrom(rashi: RashiIndex, firstRashi: RashiIndex): number {
  return ((rashi - firstRashi + 12) % 12) + 1;
}

/** Знак в выбранной варге для позиции, у которой сервер прислал оба знака. */
function vargaRashi(
  position: { rashi: RashiIndex; navamsaRashi: RashiIndex },
  varga: ChartVarga,
): RashiIndex {
  return varga === "d9" ? position.navamsaRashi : position.rashi;
}

export function buildChartView(
  chart: VedicChart,
  options: ChartViewOptions = DEFAULT_VIEW_OPTIONS,
): ChartView {
  const { varga, reference, transits } = options;

  const lagnaRashi =
    chart.lagna === null
      ? null
      : varga === "d9"
        ? navamsaRashiOf(chart.lagna.longitude)
        : chart.lagna.rashi;

  const moon = chart.grahas.find((graha) => graha.graha === "moon");
  const moonRashi = moon ? vargaRashi(moon, varga) : null;

  const firstRashi = reference === "moon" ? moonRashi : lagnaRashi;

  const placements: ChartPlacement[] = chart.grahas.map((graha) => ({
    key: `natal-${graha.graha}`,
    graha: graha.graha,
    abbr: GRAHA_ABBR[graha.graha],
    rashi: vargaRashi(graha, varga),
    degree:
      varga === "d1"
        ? graha.degreeInRashi
        : degreeInVarga(graha.longitude, varga),
    retrograde: graha.retrograde,
    transit: false,
  }));

  /* При отсчёте от Луны первый дом — знак Луны, и лагна перестаёт совпадать
     с ним. Её ставят в клетку подписью «Лг», как в бумажной карте; при
     отсчёте от лагны она и есть первый дом и отдельной подписи не нужна. */
  if (reference === "moon" && chart.lagna && lagnaRashi !== null) {
    placements.unshift({
      key: "natal-lagna",
      graha: "lagna",
      abbr: "Лг",
      rashi: lagnaRashi,
      degree: degreeInVarga(chart.lagna.longitude, varga),
      retrograde: false,
      transit: false,
    });
  }

  for (const graha of transits ?? []) {
    placements.push({
      key: `transit-${graha.graha}`,
      graha: graha.graha,
      abbr: GRAHA_ABBR[graha.graha],
      rashi: vargaRashi(graha, varga),
      degree:
        varga === "d1"
          ? graha.degreeInRashi
          : degreeInVarga(graha.longitude, varga),
      retrograde: graha.retrograde,
      transit: true,
    });
  }

  return { varga, reference, firstRashi, placements };
}

/** Что стоит в каждом знаке. Пустые знаки тоже заведены — они рисуются. */
export function placementsByRashi(
  view: ChartView,
): Map<RashiIndex, ChartPlacement[]> {
  const map = new Map<RashiIndex, ChartPlacement[]>();
  for (let rashi = 1; rashi <= 12; rashi += 1) map.set(rashi, []);
  for (const placement of view.placements) {
    map.get(placement.rashi)!.push(placement);
  }
  return map;
}

/** Что стоит в каждом доме. Без первого дома домов нет — пустая карта. */
export function placementsByBhava(
  view: ChartView,
): Map<number, ChartPlacement[]> {
  const map = new Map<number, ChartPlacement[]>();
  if (view.firstRashi === null) return map;
  for (let bhava = 1; bhava <= 12; bhava += 1) map.set(bhava, []);
  for (const placement of view.placements) {
    map.get(bhavaFrom(placement.rashi, view.firstRashi))!.push(placement);
  }
  return map;
}

export interface PlacementLine {
  items: ChartPlacement[];
  /** Градусы помещаются, только когда в строке одна граха. */
  withDegrees: boolean;
}

/**
 * Раскладка подписей клетки по строкам. Пока грах немного, каждая идёт своей
 * строкой с градусами; когда столбик перестаёт помещаться в клетку (обычно
 * это натальные и транзитные грахи в одном знаке), они встают по две в строку
 * без градусов — градусы остаются в таблице под картой.
 */
export function packPlacementLines(
  items: ReadonlyArray<ChartPlacement>,
  maxSingleLines: number,
): PlacementLine[] {
  if (items.length <= maxSingleLines) {
    return items.map((item) => ({ items: [item], withDegrees: true }));
  }
  const lines: PlacementLine[] = [];
  for (let i = 0; i < items.length; i += 2) {
    lines.push({ items: items.slice(i, i + 2), withDegrees: false });
  }
  return lines;
}

/**
 * Подпись в центре ромба. Центр — точка, где сходятся четыре кендры, и
 * длинная строка там заезжает в дома 4 и 10. Поэтому аянамша — только у
 * натальной D1 от лагны, в остальных видах — коротко, что именно показано.
 */
export function northCenterLabel(view: ChartView, ayanamsa: number): string {
  if (view.varga === "d1" && view.reference === "lagna") {
    return `аянамша ${formatDegrees(ayanamsa)}`;
  }
  return [
    view.varga === "d9" ? "D9" : "D1",
    view.reference === "moon" ? "от Луны" : "от лагны",
  ].join(" · ");
}
