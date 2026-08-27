import { describe, expect, it } from "vitest";
import {
  PLAYER_STATE_VERSION,
  parsePlayerState,
  serializePlayerState,
} from "./player-state";
import type { PersistedPlayerState } from "./player-state";

const state: PersistedPlayerState = {
  version: PLAYER_STATE_VERSION,
  queue: ["t1", "t2", "t3"],
  index: 1,
  positionSeconds: 128,
  repeat: "all",
  shuffle: true,
  shuffleSeed: 12345,
  rate: 1.25,
  volume: 0.6,
};

describe("круг сериализации", () => {
  it("состояние переживает запись и чтение", () => {
    expect(parsePlayerState(serializePlayerState(state))).toEqual(state);
  });
});

describe("parsePlayerState", () => {
  it("пустое хранилище — не состояние, а его отсутствие", () => {
    expect(parsePlayerState(null)).toBeNull();
    expect(parsePlayerState("")).toBeNull();
  });

  it("битый JSON не роняет плеер", () => {
    // localStorage переживает обрыв записи и чужие расширения.
    expect(parsePlayerState("{не json")).toBeNull();
    expect(parsePlayerState("[1,2,3")).toBeNull();
  });

  it("не объект отбрасывается", () => {
    expect(parsePlayerState('"строка"')).toBeNull();
    expect(parsePlayerState("42")).toBeNull();
    expect(parsePlayerState("null")).toBeNull();
  });

  it("чужая версия схемы отбрасывается целиком", () => {
    // Поля могли поменять смысл: применять их наугад хуже, чем начать с нуля.
    const old = JSON.stringify({ ...state, version: 0 });

    expect(parsePlayerState(old)).toBeNull();
  });

  it("состояние без очереди бесполезно", () => {
    expect(parsePlayerState(JSON.stringify({ ...state, queue: [] }))).toBeNull();
    expect(
      parsePlayerState(JSON.stringify({ ...state, queue: "не массив" })),
    ).toBeNull();
  });

  it("из очереди выкидывает всё, что не строка", () => {
    const parsed = parsePlayerState(
      JSON.stringify({ ...state, queue: ["t1", 42, null, "t2", ""] }),
    );

    expect(parsed?.queue).toEqual(["t1", "t2"]);
  });

  it("позицию за краем очереди возвращает на начало", () => {
    expect(parsePlayerState(JSON.stringify({ ...state, index: 99 }))?.index).toBe(
      0,
    );
    expect(parsePlayerState(JSON.stringify({ ...state, index: -1 }))?.index).toBe(
      0,
    );
  });

  it("отрицательную секунду обнуляет", () => {
    expect(
      parsePlayerState(JSON.stringify({ ...state, positionSeconds: -10 }))
        ?.positionSeconds,
    ).toBe(0);
  });

  it("неизвестный режим повтора заменяет выключенным", () => {
    expect(
      parsePlayerState(JSON.stringify({ ...state, repeat: "всегда" }))?.repeat,
    ).toBe("off");
  });

  describe("скорость", () => {
    it("держит в границах 0.75–2", () => {
      expect(parsePlayerState(JSON.stringify({ ...state, rate: 5 }))?.rate).toBe(
        2,
      );
      expect(
        parsePlayerState(JSON.stringify({ ...state, rate: 0.1 }))?.rate,
      ).toBe(0.75);
    });

    it("мусор заменяет обычной скоростью", () => {
      expect(
        parsePlayerState(JSON.stringify({ ...state, rate: "быстро" }))?.rate,
      ).toBe(1);
    });
  });

  describe("громкость", () => {
    it("держит в границах 0–1", () => {
      expect(
        parsePlayerState(JSON.stringify({ ...state, volume: 3 }))?.volume,
      ).toBe(1);
      expect(
        parsePlayerState(JSON.stringify({ ...state, volume: -1 }))?.volume,
      ).toBe(0);
    });

    it("мусор заменяет полной громкостью", () => {
      expect(
        parsePlayerState(JSON.stringify({ ...state, volume: null }))?.volume,
      ).toBe(1);
    });
  });

  it("отсутствующие поля добираются значениями по умолчанию", () => {
    // Состояние могло быть записано более старой сборкой этой же версии.
    const parsed = parsePlayerState(
      JSON.stringify({ version: PLAYER_STATE_VERSION, queue: ["t1"] }),
    );

    expect(parsed).toEqual({
      version: PLAYER_STATE_VERSION,
      queue: ["t1"],
      index: 0,
      positionSeconds: 0,
      repeat: "off",
      shuffle: false,
      shuffleSeed: 1,
      rate: 1,
      volume: 1,
    });
  });
});

describe("serializePlayerState", () => {
  it("пишет версию — по ней читатель решает, доверять ли", () => {
    expect(JSON.parse(serializePlayerState(state)).version).toBe(
      PLAYER_STATE_VERSION,
    );
  });
});
