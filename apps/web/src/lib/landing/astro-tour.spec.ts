import { describe, expect, it } from "vitest";
import { ASTRO_COMPATIBILITY_PURPOSES } from "@vedamatch/shared";
import {
  ASTRO_CURSOR_TRAVEL,
  ASTRO_DURATIONS,
  ASTRO_STEPS,
  ASTRO_TOUR_START,
  isAstroPressing,
  nextAstroState,
  shownPurpose,
  type AstroTourState,
} from "./astro-tour";

const STEPS = ASTRO_STEPS.length;

function advance(times: number): AstroTourState {
  let state = ASTRO_TOUR_START;
  for (let i = 0; i < times; i += 1) state = nextAstroState(state, STEPS);
  return state;
}

describe("шаги ролика", () => {
  it("обходят все цели сверки, не пропуская ни одной", () => {
    expect(ASTRO_STEPS.map((s) => s.purpose).sort()).toEqual(
      [...ASTRO_COMPATIBILITY_PURPOSES].sort(),
    );
  });

  it("начинают с семьи — с неё сервис начинался", () => {
    expect(ASTRO_STEPS[0].purpose).toBe("family");
  });

  it("у каждого шага есть реплика", () => {
    for (const step of ASTRO_STEPS) {
      expect(step.caption.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("nextAstroState", () => {
  it("проходит фазы по порядку и переходит к следующей цели", () => {
    expect(advance(1)).toEqual({ index: 0, phase: "press" });
    expect(advance(2)).toEqual({ index: 0, phase: "reacting" });
    expect(advance(3)).toEqual({ index: 1, phase: "telling" });
  });

  it("замыкает ролик в круг", () => {
    expect(advance(3 * STEPS)).toEqual(ASTRO_TOUR_START);
  });
});

describe("shownPurpose", () => {
  it("переключает таблицу только после нажатия", () => {
    // Пока палец едет, на экране ещё прошлая цель — иначе таблица менялась
    // бы до касания и нажатие выглядело бы ни на что не влияющим.
    expect(shownPurpose({ index: 1, phase: "telling" }, ASTRO_STEPS)).toBe(
      ASTRO_STEPS[0].purpose,
    );
    expect(shownPurpose({ index: 1, phase: "press" }, ASTRO_STEPS)).toBe(
      ASTRO_STEPS[1].purpose,
    );
    expect(shownPurpose({ index: 1, phase: "reacting" }, ASTRO_STEPS)).toBe(
      ASTRO_STEPS[1].purpose,
    );
  });

  it("на первом шаге круга показывает последнюю цель прошлого", () => {
    expect(shownPurpose(ASTRO_TOUR_START, ASTRO_STEPS)).toBe(
      ASTRO_STEPS[STEPS - 1].purpose,
    );
  });
});

describe("isAstroPressing", () => {
  it("отмечает только фазу нажатия", () => {
    expect(isAstroPressing("press")).toBe(true);
    expect(isAstroPressing("telling")).toBe(false);
    expect(isAstroPressing("reacting")).toBe(false);
  });
});

describe("тайминги", () => {
  it("дают пальцу доехать раньше, чем сменится фаза", () => {
    expect(ASTRO_CURSOR_TRAVEL).toBeLessThanOrEqual(ASTRO_DURATIONS.telling);
  });

  it("оставляют время прочитать таблицу после переключения", () => {
    expect(ASTRO_DURATIONS.reacting).toBeGreaterThanOrEqual(1500);
  });
});
