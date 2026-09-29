import { describe, expect, it } from "vitest";
import {
  DEFAULT_RAIL,
  RAIL_ACTIONS,
  moveRailAction,
  parseRailConfig,
  railActionMeta,
  serializeRailConfig,
  toggleRailAction,
} from "./rail-actions";

describe("DEFAULT_RAIL", () => {
  it("повторяет прежний ряд; «Викторины» в нём нет (VED-656)", () => {
    expect(DEFAULT_RAIL).toEqual([
      "like",
      "save",
      "share",
      "hide",
      "speak",
      "edit",
      "create",
    ]);
  });

  it("состоит только из известных кнопок", () => {
    const known = new Set(RAIL_ACTIONS.map((action) => action.id));
    for (const id of DEFAULT_RAIL) expect(known.has(id)).toBe(true);
  });

  it("у каждой кнопки есть название и польза словами", () => {
    for (const action of RAIL_ACTIONS) {
      expect(action.label.trim().length).toBeGreaterThan(0);
      expect(action.hint.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("parseRailConfig", () => {
  it("пусто в хранилище — заводская раскладка", () => {
    expect(parseRailConfig(null)).toEqual([...DEFAULT_RAIL]);
    expect(parseRailConfig("")).toEqual([...DEFAULT_RAIL]);
  });

  it("мусор не роняет ленту", () => {
    expect(parseRailConfig("{не json")).toEqual([...DEFAULT_RAIL]);
    expect(parseRailConfig('{"a":1}')).toEqual([...DEFAULT_RAIL]);
  });

  it("кнопка из прошлой версии выбрасывается, свои остаются", () => {
    const known = RAIL_ACTIONS.map((action) => action.id);
    expect(
      parseRailConfig(
        JSON.stringify({ ids: ["like", "прошлая", "share"], known }),
      ),
    ).toEqual(["like", "share"]);
  });

  it("дубли схлопываются", () => {
    expect(
      parseRailConfig(serializeRailConfig(["like", "like", "save"])),
    ).toEqual(["like", "save"]);
  });

  it("пустой ряд — это выбор, а не поломка", () => {
    expect(parseRailConfig(serializeRailConfig([]))).toEqual([]);
  });

  it("читает то, что сама записала", () => {
    const ids = ["share", "like"] as const;
    expect(parseRailConfig(serializeRailConfig(ids))).toEqual([...ids]);
  });

  it("старый ряд читается как был: сами кнопки не возвращаются", () => {
    expect(parseRailConfig('["share","like"]')).toEqual(["share", "like"]);
    expect(parseRailConfig("[]")).toEqual([]);
    expect(parseRailConfig('["like"]')).not.toContain("save");
  });

  it("«Викторина» из сохранённого ряда уходит молча (VED-656)", () => {
    const known = [...RAIL_ACTIONS.map((action) => action.id), "quiz"];
    expect(
      parseRailConfig(JSON.stringify({ ids: ["like", "quiz"], known })),
    ).toEqual(["like"]);
  });

  it("новая кнопка ряда по умолчанию доезжает до тех, кто её ещё не видел", () => {
    expect(
      parseRailConfig(
        JSON.stringify({ ids: ["like"], known: ["like", "save"] }),
      ),
    ).toEqual([
      // «Сохранить» человек видел и убрал — она не возвращается.
      "like",
      "share",
      "hide",
      "speak",
      "edit",
      "create",
    ]);
  });
});

describe("toggleRailAction", () => {
  it("выключенная уходит из ряда", () => {
    expect(toggleRailAction(["like", "save"], "like")).toEqual(["save"]);
  });

  it("включённая встаёт в конец", () => {
    expect(toggleRailAction(["like"], "random")).toEqual(["like", "random"]);
  });

  it("исходный ряд не меняется", () => {
    const before = ["like"] as const;
    toggleRailAction(before, "save");
    expect(before).toEqual(["like"]);
  });
});

describe("moveRailAction", () => {
  it("сдвигает влево и вправо", () => {
    expect(moveRailAction(["like", "save", "share"], "save", -1)).toEqual([
      "save",
      "like",
      "share",
    ]);
    expect(moveRailAction(["like", "save", "share"], "save", 1)).toEqual([
      "like",
      "share",
      "save",
    ]);
  });

  it("с краю никуда не двигается", () => {
    expect(moveRailAction(["like", "save"], "like", -1)).toEqual([
      "like",
      "save",
    ]);
    expect(moveRailAction(["like", "save"], "save", 1)).toEqual([
      "like",
      "save",
    ]);
  });

  it("чужую кнопку не двигает", () => {
    expect(moveRailAction(["like"], "share", 1)).toEqual(["like"]);
  });
});

describe("railActionMeta", () => {
  it("находит описание по имени", () => {
    expect(railActionMeta("speak").label).toBe("Озвучить");
    expect(railActionMeta("hide").onlyWhen).toContain("фотограф");
  });
});
