/**
 * Ролик в макете портала на лендинге: курсор обходит сервисы по кругу, на
 * каждом заходит внутрь и возвращается. Последовательность вынесена из
 * компонента отдельным модулем — это чистая логика, её проверяет тест, тогда
 * как саму анимацию в jsdom не измеришь.
 */

/**
 * Фаза одной остановки:
 * - `moving` — курсор едет к плитке сервиса;
 * - `press` — клик по плитке, мини-экран ещё не открыт;
 * - `inside` — экран сервиса открыт, курсор едет к кнопке «назад»;
 * - `back` — клик по «назад», после него открывается следующая остановка.
 */
export type TourPhase = "moving" | "press" | "inside" | "back";

export interface TourState {
  /** Индекс остановки в маршруте. */
  index: number;
  phase: TourPhase;
}

/**
 * Сколько живёт каждая фаза, мс. `inside` заметно длиннее остальных: это
 * единственное время, когда гость читает содержимое сервиса, а не смотрит на
 * механику клика.
 */
export const TOUR_DURATIONS: Record<TourPhase, number> = {
  moving: 760,
  press: 260,
  inside: 1900,
  back: 280,
};

/**
 * Сколько едет сам курсор, мс. Не совпадает с длительностью фазы: внутри
 * сервиса курсор доезжает до «назад» за 620 мс и оставшееся время просто
 * стоит, иначе он полз бы через весь экран все 1900 мс.
 */
export const CURSOR_TRAVEL: Record<TourPhase, number> = {
  moving: 700,
  press: 120,
  inside: 620,
  back: 120,
};

const ORDER: TourPhase[] = ["moving", "press", "inside", "back"];

export const TOUR_START: TourState = { index: 0, phase: "moving" };

/**
 * Следующее состояние. Внутри остановки фазы идут по порядку, после `back`
 * маршрут переходит к следующему сервису и замыкается в круг.
 */
export function nextTourState(state: TourState, stops: number): TourState {
  const at = ORDER.indexOf(state.phase);
  if (at < ORDER.length - 1) {
    return { index: state.index, phase: ORDER[at + 1] };
  }
  return { index: (state.index + 1) % stops, phase: "moving" };
}

/**
 * Открыт ли мини-экран сервиса. Он появляется по итогу клика, а не в момент
 * нажатия: на `press` гость ещё должен увидеть, по чему именно кликнули.
 */
export function isDemoOpen(phase: TourPhase): boolean {
  return phase === "inside" || phase === "back";
}

/** Куда едет курсор: к плитке в сетке или к кнопке «назад» внутри сервиса. */
export function cursorTarget(phase: TourPhase): "tile" | "back" {
  return isDemoOpen(phase) ? "back" : "tile";
}

/** Нажат ли прямо сейчас элемент под курсором — для отклика плитки и кольца. */
export function isPressing(phase: TourPhase): boolean {
  return phase === "press" || phase === "back";
}
