import { describe, expect, it } from "vitest";
import { hasVisibleLyrics } from "./use-track-lyrics";

describe("hasVisibleLyrics", () => {
  it("нет записи — нечего показывать", () => {
    expect(hasVisibleLyrics(null)).toBe(false);
  });

  it("все три поля пустые — нечего показывать", () => {
    expect(
      hasVisibleLyrics({ lyrics: null, transliteration: null, translation: null }),
    ).toBe(false);
  });

  it("пустые строки и одни пробелы считаются пустотой (админ не до конца очистил поле)", () => {
    expect(
      hasVisibleLyrics({ lyrics: "", transliteration: "   ", translation: "\n" }),
    ).toBe(false);
  });

  it("текст оригинала непустой — кнопка нужна", () => {
    expect(
      hasVisibleLyrics({
        lyrics: "Харе Кришна",
        transliteration: null,
        translation: null,
      }),
    ).toBe(true);
  });

  it("непустая только транслитерация — тоже кнопка нужна", () => {
    expect(
      hasVisibleLyrics({
        lyrics: null,
        transliteration: "Hare Krishna",
        translation: null,
      }),
    ).toBe(true);
  });

  it("непустой только перевод — тоже кнопка нужна", () => {
    expect(
      hasVisibleLyrics({
        lyrics: null,
        transliteration: null,
        translation: "О Господь Кришна",
      }),
    ).toBe(true);
  });
});
