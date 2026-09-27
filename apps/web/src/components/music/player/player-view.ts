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

/**
 * Место пузыря по умолчанию: левый нижний угол (VED-592). Раньше пузырь
 * висел на 6rem выше края — над нижним рядом разделов, — и заказчик попросил
 * опустить его в самый угол, к краю экрана. Отступ 1rem над безопасной зоной
 * — чтобы не сесть на системную полосу жестов. Пульт озвучки (справа под
 * шапкой) и полоса плеера (в виде «пузырь» её нет) здесь не пересекаются;
 * если угол занят полем ввода, пузырь переносится долгим нажатием (VED-454).
 *
 * Отдельной строкой, а не в разметке: её проверяет тест, и вместе с ней
 * сдвигается сохранённое смещение — оно считается от этого места.
 */
export const PLAYER_BUBBLE_PLACEMENT =
  "bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-3";

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
 * Откреплённая полоса (VED-454) — тоже: она висит там, куда её отнесли, и
 * поле внизу страницы под ней было бы пустой дырой.
 */
export function reservedPlayerSpace(
  view: PlayerView,
  barTop: number,
  viewportHeight: number,
  detached = false,
): number {
  if (view === "bubble" || detached) return 0;
  if (!Number.isFinite(barTop) || !Number.isFinite(viewportHeight)) return 0;
  return Math.max(0, Math.ceil(viewportHeight - barTop));
}
