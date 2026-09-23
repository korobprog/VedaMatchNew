import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYER_PREFS,
  pinnedLayout,
  parseStoredPrefs,
  prefsFromSettings,
  prefsToSettingsPatch,
  seekButtonLabel,
  serializePrefs,
} from "./player-prefs";

describe("prefsFromSettings", () => {
  it("без ответа сервера — умолчания: шаг 15 с, ничего не вынесено", () => {
    expect(prefsFromSettings(null)).toEqual(DEFAULT_PLAYER_PREFS);
    expect(DEFAULT_PLAYER_PREFS.seekBackSeconds).toBe(15);
  });

  it("переносит сохранённое и отбрасывает шаг вне списка", () => {
    expect(
      prefsFromSettings({
        seekBackSeconds: 5,
        seekForwardSeconds: 37,
        playerShowSeek: true,
        playerShowBookmark: false,
        playerShowHistory: true,
      }),
    ).toEqual({
      seekBackSeconds: 5,
      seekForwardSeconds: 15,
      showSeek: true,
      showBookmark: false,
      showHistory: true,
    });
  });
});

describe("prefsToSettingsPatch", () => {
  it("шлёт только изменённое, под именами сервера", () => {
    expect(prefsToSettingsPatch({ showHistory: true })).toEqual({
      playerShowHistory: true,
    });
    expect(prefsToSettingsPatch({ seekForwardSeconds: 30 })).toEqual({
      seekForwardSeconds: 30,
    });
  });
});

describe("копия в localStorage", () => {
  it("переживает круг записи и чтения", () => {
    const prefs = { ...DEFAULT_PLAYER_PREFS, seekBackSeconds: 60, showBookmark: true };
    expect(parseStoredPrefs(serializePrefs(prefs))).toEqual(prefs);
  });

  it("битая — null, а не исключение", () => {
    expect(parseStoredPrefs("{oops")).toBeNull();
    expect(parseStoredPrefs("null")).toBeNull();
    expect(parseStoredPrefs(null)).toBeNull();
  });
});

describe("seekButtonLabel", () => {
  it("склоняет шаг", () => {
    expect(seekButtonLabel(-1, 15)).toBe("Назад на 15 секунд");
    expect(seekButtonLabel(1, 5)).toBe("Вперёд на 5 секунд");
    expect(seekButtonLabel(1, 60)).toBe("Вперёд на 1 минуту");
    expect(seekButtonLabel(-1, 1)).toBe("Назад на 1 секунду");
    expect(seekButtonLabel(-1, 2)).toBe("Назад на 2 секунды");
  });
});

describe("pinnedLayout", () => {
  it("по умолчанию строки нет — полоса не растёт", () => {
    expect(pinnedLayout(DEFAULT_PLAYER_PREFS)).toBe("none");
  });

  it("одна перемотка — строка только на узком экране", () => {
    expect(pinnedLayout({ ...DEFAULT_PLAYER_PREFS, showSeek: true })).toBe("narrow");
  });

  it("«Метка» или «История» — строка на любой ширине", () => {
    expect(pinnedLayout({ ...DEFAULT_PLAYER_PREFS, showHistory: true })).toBe("all");
    expect(
      pinnedLayout({ ...DEFAULT_PLAYER_PREFS, showSeek: true, showBookmark: true }),
    ).toBe("all");
  });
});
