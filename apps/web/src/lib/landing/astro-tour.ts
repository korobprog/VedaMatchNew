import type { AstroCompatibilityPurpose } from "@vedamatch/shared";

/**
 * Ролик витрины Астрологии: палец обходит цели сверки и на каждой
 * рассказывает, чем её расчёт отличается от сватовского.
 *
 * Своя маленькая машина фаз, а не общая с колодой Знакомств: у той есть
 * возврат анкеты и закрытие разбора, здесь этого нет, и общий на двоих
 * автомат пришлось бы обвешивать условиями ради одного случая.
 */

export type AstroPhase = "telling" | "press" | "reacting";

export interface AstroStep {
  purpose: AstroCompatibilityPurpose;
  /** Что рассказываем, пока палец едет к кнопке цели. */
  caption: string;
}

export const ASTRO_STEPS: AstroStep[] = [
  {
    purpose: "family",
    caption: "Для семьи считаем по-сватовски: все восемь кут, максимум 36",
  },
  {
    purpose: "business",
    caption: "Для дела снимаем то, что про брак, — остаётся 24",
  },
  {
    purpose: "friendship",
    caption: "Дружбе не нужен и достаток пары: 17",
  },
  {
    purpose: "service",
    caption: "Служению важнее согласие нравов — 15",
  },
];

export interface AstroTourState {
  index: number;
  phase: AstroPhase;
}

export const ASTRO_TOUR_START: AstroTourState = { index: 0, phase: "telling" };

export const ASTRO_DURATIONS: Record<AstroPhase, number> = {
  telling: 2400,
  press: 280,
  reacting: 2000,
};

export const ASTRO_CURSOR_TRAVEL = 620;

const ORDER: AstroPhase[] = ["telling", "press", "reacting"];

export function nextAstroState(
  state: AstroTourState,
  steps: number,
): AstroTourState {
  const at = ORDER.indexOf(state.phase);
  if (at < ORDER.length - 1) {
    return { index: state.index, phase: ORDER[at + 1] };
  }
  return { index: (state.index + 1) % steps, phase: "telling" };
}

export function isAstroPressing(phase: AstroPhase): boolean {
  return phase === "press";
}

/**
 * Какая цель показана на экране. Переключается по нажатию, а не заранее:
 * иначе таблица менялась бы до того, как палец коснулся кнопки.
 */
export function shownPurpose(
  state: AstroTourState,
  steps: AstroStep[],
): AstroCompatibilityPurpose {
  const index =
    state.phase === "telling"
      ? (state.index - 1 + steps.length) % steps.length
      : state.index;
  return steps[index].purpose;
}
