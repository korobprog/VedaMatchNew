/**
 * Вид полосы плеера: развёрнута, свёрнута в полоску или убрана в плавающий
 * пузырь (VED-366).
 *
 * Хранится под прежним ключом свёрнутости: у тех, кто уже свернул полосу,
 * там лежит «1», и после выката она обязана остаться свёрнутой, а не
 * распахнуться на весь низ экрана.
 */

export type PlayerView = "expanded" | "collapsed" | "bubble";

export const PLAYER_VIEW_KEY = "vedamatch:music-player-collapsed";

/** Разбор сохранённого значения. Незнакомое — развёрнутая полоса. */
export function parsePlayerView(raw: string | null | undefined): PlayerView {
  if (raw === "1") return "collapsed";
  if (raw === "bubble") return "bubble";
  return "expanded";
}

export function serializePlayerView(view: PlayerView): string {
  if (view === "collapsed") return "1";
  if (view === "bubble") return "bubble";
  return "0";
}

/**
 * Сколько места снизу страница отдаёт полосе: от верхнего края полосы до
 * низа окна. Замер вместо чисел в CSS: состав полосы зависит от ширины,
 * вынесенных кнопок и подъёма, и каждое число в globals.css рано или поздно
 * расходилось с полосой — последние ~18 точек страницы уходили под неё
 * (замечание к PR #500). Пузырь места не занимает: он плавает поверх.
 */
export function reservedPlayerSpace(
  view: PlayerView,
  barTop: number,
  viewportHeight: number,
): number {
  if (view === "bubble") return 0;
  if (!Number.isFinite(barTop) || !Number.isFinite(viewportHeight)) return 0;
  return Math.max(0, Math.ceil(viewportHeight - barTop));
}
