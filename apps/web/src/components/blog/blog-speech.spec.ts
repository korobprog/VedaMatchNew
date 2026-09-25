import { describe, expect, it } from "vitest";
import { buildSpokenPost, speechChunks, spokenLanguage } from "./blog-speech";

describe("озвучка поста (VED-476)", () => {
  it("читает заголовок и текст, ссылки — словом", () => {
    expect(
      buildSpokenPost({
        title: "Экадаши",
        text: "Подробнее:  https://vcalendar.ru\n\nХаре Кришна",
      }),
    ).toBe("Экадаши. Подробнее: ссылка Харе Кришна");
    expect(buildSpokenPost({ title: null, text: "  " })).toBe("");
  });

  it("язык по буквам", () => {
    expect(spokenLanguage("Харе Кришна")).toBe("ru-RU");
    expect(spokenLanguage("kṛṣṇa")).toBe("en-US");
  });

  it("длинный текст — куски по фразам не длиннее предела", () => {
    const text = Array.from(
      { length: 30 },
      (_, at) => `Фраза номер ${at}.`,
    ).join(" ");
    const chunks = speechChunks(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 60)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("фраза длиннее предела режется по словам", () => {
    const text = "слово ".repeat(50).trim();
    const chunks = speechChunks(text, 40);
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });
});
