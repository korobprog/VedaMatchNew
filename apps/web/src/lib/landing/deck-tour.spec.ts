import { describe, expect, it } from "vitest";
import {
  DECK_CURSOR_TRAVEL,
  DECK_DURATIONS,
  DECK_STEPS,
  DECK_TOUR_START,
  cursorTarget,
  isAstroOpen,
  isBreakdownOpen,
  isDeckPressing,
  nextDeckState,
  replyFor,
  shouldAdvanceCard,
  type DeckPhase,
  type DeckTourState,
} from "./deck-tour";

const STEPS = DECK_STEPS.length;

function advance(times: number): DeckTourState {
  let state = DECK_TOUR_START;
  for (let i = 0; i < times; i += 1) state = nextDeckState(state, DECK_STEPS);
  return state;
}

/** Сколько переходов занимает шаг: у разбора добавлена фаза закрытия. */
function phasesIn(index: number): number {
  return DECK_STEPS[index].opens ? 4 : 3;
}

describe("nextDeckState", () => {
  it("проходит фазы шага по порядку", () => {
    expect(advance(1)).toEqual({ index: 0, phase: "press" });
    expect(advance(2)).toEqual({ index: 0, phase: "reacting" });
  });

  it("после ответа переходит к следующей кнопке", () => {
    // Первый шаг разбора не открывает, поэтому фаз у него три.
    expect(advance(3)).toEqual({ index: 1, phase: "telling" });
  });

  it("ведёт курсор к крестику, пока разбор раскрыт", () => {
    const ring = DECK_STEPS.findIndex((step) => step.action === "ring");
    expect(cursorTarget({ index: ring, phase: "telling" }, DECK_STEPS, null)).toBe(
      "ring",
    );
    expect(cursorTarget({ index: ring, phase: "reacting" }, DECK_STEPS, "breakdown")).toBe(
      "close",
    );
    expect(cursorTarget({ index: ring, phase: "closing" }, DECK_STEPS, "breakdown")).toBe(
      "close",
    );
  });

  it("на остальных шагах целится в кнопку шага", () => {
    for (let index = 0; index < STEPS; index += 1) {
      if (DECK_STEPS[index].opens) continue;
      expect(cursorTarget({ index, phase: "reacting" }, DECK_STEPS, null)).toBe(
        DECK_STEPS[index].action,
      );
    }
  });

  it("целится в крестик и на чужом шаге, если разбор раскрыл сам гость", () => {
    // Иначе палец тыкал бы в кнопки, спрятанные под раскрытой панелью.
    for (let index = 0; index < STEPS; index += 1) {
      expect(cursorTarget({ index, phase: "telling" }, DECK_STEPS, "breakdown")).toBe(
        "close",
      );
    }
  });

  it("замыкает ролик в круг", () => {
    const total = DECK_STEPS.reduce((sum, _, index) => sum + phasesIn(index), 0);
    expect(advance(total)).toEqual(DECK_TOUR_START);
  });

  it("вклинивает закрытие разбора между ответом и следующей кнопкой", () => {
    const ring = DECK_STEPS.findIndex((step) => step.action === "ring");
    expect(nextDeckState({ index: ring, phase: "reacting" }, DECK_STEPS)).toEqual({
      index: ring,
      phase: "closing",
    });
    expect(nextDeckState({ index: ring, phase: "closing" }, DECK_STEPS)).toEqual({
      index: (ring + 1) % STEPS,
      phase: "telling",
    });
  });

  it("не вклинивает её туда, где закрывать нечего", () => {
    for (let index = 0; index < STEPS; index += 1) {
      if (DECK_STEPS[index].opens) continue;
      expect(nextDeckState({ index, phase: "reacting" }, DECK_STEPS).phase).toBe(
        "telling",
      );
    }
  });
});

describe("shouldAdvanceCard", () => {
  it("листает карточку ровно раз за шаг — на показе ответа", () => {
    const phases: DeckPhase[] = ["telling", "press", "reacting"];
    expect(phases.filter(shouldAdvanceCard)).toEqual(["reacting"]);
  });
});

describe("isDeckPressing", () => {
  it("отмечает только фазу нажатия", () => {
    expect(isDeckPressing("press")).toBe(true);
    expect(isDeckPressing("telling")).toBe(false);
    expect(isDeckPressing("reacting")).toBe(false);
  });
});

describe("replyFor", () => {
  it("молчит, пока кнопка не нажата", () => {
    expect(replyFor({ index: 1, phase: "telling" }, DECK_STEPS)).toBeNull();
    expect(replyFor({ index: 1, phase: "press" }, DECK_STEPS)).toBeNull();
  });

  it("показывает ответ сервиса после нажатия", () => {
    // Ищем по действию, а не по номеру: порядок шагов — вопрос сценария, и
    // тест не должен падать оттого, что между ними вставили ещё один.
    const superlike = DECK_STEPS.findIndex((step) => step.action === "superlike");
    expect(replyFor({ index: superlike, phase: "reacting" }, DECK_STEPS)).toBe(
      "Суперлайк отправлен",
    );
  });

  it("молчит на пропуске и возврате — в сервисе они тоже молчат", () => {
    for (const action of ["pass", "undo"] as const) {
      const index = DECK_STEPS.findIndex((step) => step.action === action);
      expect(replyFor({ index, phase: "reacting" }, DECK_STEPS)).toBeNull();
    }
  });
});

describe("шаги ролика", () => {
  it("используют только кнопки, которые есть в колоде сервиса", () => {
    // pass/superlike/like уходят в POST /union/swipes, undo — в
    // DELETE /union/swipes/last, ring — кольцо совместимости в центре панели.
    for (const step of DECK_STEPS) {
      expect([
        "pass",
        "undo",
        "ring",
        "superlike",
        "like",
        "astro",
        "astro-business",
      ]).toContain(step.action);
    }
  });

  it("обходят всю панель решений и сверку по звёздам", () => {
    const visited = new Set(DECK_STEPS.map((step) => step.action));
    expect([...visited].sort()).toEqual(
      [
        "astro",
        "astro-business",
        "like",
        "pass",
        "ring",
        "superlike",
        "undo",
      ].sort(),
    );
  });

  it("возврат анкеты листает колоду назад, а не вперёд", () => {
    const undo = DECK_STEPS.find((step) => step.action === "undo");
    expect(undo?.move).toBe("prev");
  });

  it("оставляет анкету на месте, пока открыт её разбор", () => {
    // Уведи карточку из-под разбора — и он окажется разбором чужого процента.
    const ring = DECK_STEPS.find((step) => step.action === "ring");
    expect(ring?.move).toBe("none");
    expect(ring?.opens).toBe("breakdown");
  });

  it("решения свайпа листают вперёд", () => {
    const swipes = DECK_STEPS.filter((s) =>
      ["pass", "superlike", "like"].includes(s.action),
    );
    for (const step of swipes) expect(step.move).toBe("next");
  });

  it("держит разбор открытым ровно на своём шаге", () => {
    // Панель, пережившая свой шаг, висела бы поверх колоды, пока ролик
    // вслепую жмёт кнопки под ней.
    const ring = DECK_STEPS.findIndex((step) => step.action === "ring");
    expect(isBreakdownOpen({ index: ring, phase: "reacting" }, DECK_STEPS)).toBe(true);
    expect(isBreakdownOpen({ index: ring, phase: "telling" }, DECK_STEPS)).toBe(false);
    expect(isBreakdownOpen({ index: ring, phase: "press" }, DECK_STEPS)).toBe(false);
  });

  it("не открывает разбор ни на одном чужом шаге", () => {
    for (let index = 0; index < DECK_STEPS.length; index += 1) {
      if (DECK_STEPS[index].action === "ring") continue;
      expect(isBreakdownOpen({ index, phase: "reacting" }, DECK_STEPS)).toBe(false);
    }
  });

  it("сверку карт открывает только её собственный шаг", () => {
    const astro = DECK_STEPS.findIndex(
      (step) => step.action === "astro-business",
    );
    expect(isAstroOpen({ index: astro, phase: "reacting" }, DECK_STEPS)).toBe(true);
    for (let index = 0; index < DECK_STEPS.length; index += 1) {
      if (index === astro) continue;
      expect(isAstroOpen({ index, phase: "reacting" }, DECK_STEPS)).toBe(false);
    }
  });

  it("не путает панели между собой", () => {
    const astro = DECK_STEPS.findIndex(
      (step) => step.action === "astro-business",
    );
    const ring = DECK_STEPS.findIndex((step) => step.action === "ring");
    expect(isBreakdownOpen({ index: astro, phase: "reacting" }, DECK_STEPS)).toBe(false);
    expect(isAstroOpen({ index: ring, phase: "reacting" }, DECK_STEPS)).toBe(false);
  });

  it("даёт разбору больше времени, чем обычному ответу", () => {
    // Семь строк за полторы секунды не прочитать.
    const ring = DECK_STEPS.find((step) => step.action === "ring");
    expect(ring?.hold).toBeGreaterThan(DECK_DURATIONS.reacting);
  });

  it("у каждого шага есть реплика", () => {
    for (const step of DECK_STEPS) {
      expect(step.caption.trim().length).toBeGreaterThan(0);
    }
  });

  it("показывают и взаимность, и односторонний запрос", () => {
    const replies = DECK_STEPS.map((step) => step.reply);
    expect(replies).toContain("Запрос отправлен");
    expect(replies).toContain("Взаимно! Чат открыт");
  });
});

describe("меню целей сверки", () => {
  it("из меню палец идёт к самой цели, а не к крестику", () => {
    // Иначе выбор цели — то, ради чего меню и открыли, — никто не увидит.
    const menu = DECK_STEPS.findIndex((step) => step.action === "astro");
    expect(
      cursorTarget({ index: menu, phase: "reacting" }, DECK_STEPS, "astroMenu"),
    ).toBe("astro-business");
  });

  it("из остальных панелей — к крестику", () => {
    const ring = DECK_STEPS.findIndex((step) => step.action === "ring");
    expect(
      cursorTarget({ index: ring, phase: "reacting" }, DECK_STEPS, "breakdown"),
    ).toBe("close");
    expect(
      cursorTarget({ index: ring, phase: "reacting" }, DECK_STEPS, "astro"),
    ).toBe("close");
  });

  it("сперва спрашивает цель, и только потом показывает расчёт", () => {
    const menu = DECK_STEPS.findIndex((step) => step.action === "astro");
    expect(DECK_STEPS[menu].opens).toBe("astroMenu");
    expect(DECK_STEPS[menu + 1].opens).toBe("astro");
  });
});

describe("тайминги", () => {
  it("дают курсору доехать раньше, чем сменится фаза", () => {
    expect(DECK_CURSOR_TRAVEL).toBeLessThanOrEqual(DECK_DURATIONS.telling);
  });

  it("оставляют время на чтение реплики после подъезда курсора", () => {
    expect(DECK_DURATIONS.telling - DECK_CURSOR_TRAVEL).toBeGreaterThanOrEqual(
      1200,
    );
  });
});
