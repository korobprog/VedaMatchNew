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
  it("повторяет прежний ряд: настройка не переставляет кнопки сама", () => {
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
    expect(parseRailConfig('["like","прошлая","share"]')).toEqual([
      "like",
      "share",
    ]);
  });

  it("дубли схлопываются", () => {
    expect(parseRailConfig('["like","like","save"]')).toEqual(["like", "save"]);
  });

  it("пустой ряд — это выбор, а не поломка", () => {
    expect(parseRailConfig("[]")).toEqual([]);
  });

  it("читает то, что сама записала", () => {
    const ids = ["share", "like"] as const;
    expect(parseRailConfig(serializeRailConfig(ids))).toEqual([...ids]);
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
