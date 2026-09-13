import { describe, expect, it } from "vitest";
import { buildTrackEditPatch, type MusicTrackEditState } from "./music-track-edit";

const initial: MusicTrackEditState = {
  title: "Maha Mantra",
  artistId: "a1",
  lyrics: "Харе Кришна",
  transliteration: "",
  translation: "",
};

describe("buildTrackEditPatch", () => {
  it("ничего не меняли — пустой патч, API ничего не перезапишет", () => {
    expect(buildTrackEditPatch(initial, { ...initial })).toEqual({});
  });

  it("новое название уходит обрезанным", () => {
    expect(
      buildTrackEditPatch(initial, { ...initial, title: "  Маха-мантра " }),
    ).toEqual({ title: "Маха-мантра" });
  });

  it("пустое название не отправляется — без названия записи нечего показать", () => {
    expect(buildTrackEditPatch(initial, { ...initial, title: "   " })).toEqual(
      {},
    );
  });

  it("исполнитель снят — это null, а не пустая строка", () => {
    expect(buildTrackEditPatch(initial, { ...initial, artistId: "" })).toEqual({
      artistId: null,
    });
  });

  it("текст бхаджана: новый уходит, стёртый — null (VED-109)", () => {
    expect(
      buildTrackEditPatch(initial, {
        ...initial,
        lyrics: "",
        translation: "О Кришна…\n",
      }),
    ).toEqual({ lyrics: null, translation: "О Кришна…" });
  });

  it("только пробелы в конце текста правкой не считаются", () => {
    expect(
      buildTrackEditPatch(initial, { ...initial, lyrics: "Харе Кришна\n\n" }),
    ).toEqual({});
  });

  it("картинку не трогали — coverKey не уходит и обложку не снимает", () => {
    expect(buildTrackEditPatch(initial, initial, undefined)).not.toHaveProperty(
      "coverKey",
    );
  });

  it("картинку выбрали или сняли — уходит ключ или null", () => {
    expect(buildTrackEditPatch(initial, initial, "k1")).toEqual({
      coverKey: "k1",
    });
    expect(buildTrackEditPatch(initial, initial, null)).toEqual({
      coverKey: null,
    });
  });
});
