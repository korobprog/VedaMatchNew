import { describe, expect, it } from "vitest";
import { buildSpokenEntry, speechChunks } from "./entry-speech";

describe("озвучка материала (VED-515)", () => {
  it("читает заголовок, описание и текст; ссылки — словом", () => {
    expect(
      buildSpokenEntry({
        title: "Пурушоттама-врата",
        description: "Даршан, 2007",
        body: "Во время врата:\n\nсм. https://sampradaya.ru",
      }),
    ).toBe("Пурушоттама-врата. Даршан, 2007. Во время врата: см. ссылка");
    expect(buildSpokenEntry({ title: " ", description: null })).toBe("");
  });

  it("длинная катха — куски не длиннее предела", () => {
    const text = Array.from({ length: 40 }, (_, at) => `Стих ${at}.`).join(" ");
    const chunks = speechChunks(text, 50);
    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });
});
