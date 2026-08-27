import { describe, expect, it } from "vitest";
import {
  CURSOR_TRAVEL,
  TOUR_DURATIONS,
  TOUR_START,
  cursorTarget,
  isDemoOpen,
  isPressing,
  nextTourState,
  type TourPhase,
  type TourState,
} from "./preview-tour";

const STOPS = 5;

/** Прогоняет маршрут вперёд на `steps` переходов от старта. */
function advance(steps: number): TourState {
  let state = TOUR_START;
  for (let i = 0; i < steps; i += 1) {
    state = nextTourState(state, STOPS);
  }
  return state;
}

describe("nextTourState", () => {
  it("проходит фазы одной остановки по порядку", () => {
    expect(advance(1)).toEqual({ index: 0, phase: "press" });
    expect(advance(2)).toEqual({ index: 0, phase: "inside" });
    expect(advance(3)).toEqual({ index: 0, phase: "back" });
  });

  it("после возврата переходит к следующему сервису", () => {
    expect(advance(4)).toEqual({ index: 1, phase: "moving" });
  });

  it("замыкает маршрут в круг", () => {
    // Четыре фазы на остановку: полный круг из пяти сервисов — 20 переходов.
    expect(advance(4 * STOPS)).toEqual(TOUR_START);
  });

  it("обходит все остановки ровно по разу за круг", () => {
    const seen = new Set<number>();
    let state = TOUR_START;
    for (let i = 0; i < 4 * STOPS; i += 1) {
      seen.add(state.index);
      state = nextTourState(state, STOPS);
    }
    expect(seen.size).toBe(STOPS);
  });
});

describe("isDemoOpen", () => {
  it("держит экран закрытым, пока курсор едет и нажимает", () => {
    expect(isDemoOpen("moving")).toBe(false);
    expect(isDemoOpen("press")).toBe(false);
  });

  it("открывает экран после клика и до возврата", () => {
    expect(isDemoOpen("inside")).toBe(true);
    expect(isDemoOpen("back")).toBe(true);
  });
});

describe("cursorTarget", () => {
  it("ведёт курсор к плитке, пока экран закрыт", () => {
    expect(cursorTarget("moving")).toBe("tile");
    expect(cursorTarget("press")).toBe("tile");
  });

  it("ведёт курсор к «назад», пока экран открыт", () => {
    expect(cursorTarget("inside")).toBe("back");
    expect(cursorTarget("back")).toBe("back");
  });
});

describe("isPressing", () => {
  it("отмечает оба клика маршрута — по плитке и по «назад»", () => {
    expect(isPressing("press")).toBe(true);
    expect(isPressing("back")).toBe(true);
    expect(isPressing("moving")).toBe(false);
    expect(isPressing("inside")).toBe(false);
  });
});

describe("тайминги", () => {
  const phases: TourPhase[] = ["moving", "press", "inside", "back"];

  it("заданы для каждой фазы", () => {
    for (const phase of phases) {
      expect(TOUR_DURATIONS[phase]).toBeGreaterThan(0);
      expect(CURSOR_TRAVEL[phase]).toBeGreaterThan(0);
    }
  });

  it("не дают курсору ехать дольше самой фазы", () => {
    // Иначе переход оборвётся на полпути и курсор прыгнет к следующей цели.
    for (const phase of phases) {
      expect(CURSOR_TRAVEL[phase]).toBeLessThanOrEqual(TOUR_DURATIONS[phase]);
    }
  });

  it("оставляют внутри сервиса время на чтение после подъезда курсора", () => {
    expect(TOUR_DURATIONS.inside - CURSOR_TRAVEL.inside).toBeGreaterThanOrEqual(1000);
  });
});
