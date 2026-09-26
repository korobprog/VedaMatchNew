import { describe, expect, it } from "vitest";
import { entryOutline, isHeadingParagraph } from "./entry-outline";

describe("isHeadingParagraph (VED-538)", () => {
  it("короткая строка без точки — заголовок", () => {
    expect(isHeadingParagraph("1. Введение")).toBe(true);
    expect(isHeadingParagraph("Вопрос о служении")).toBe(true);
    expect(isHeadingParagraph("Что такое бхакти?")).toBe(true);
  });

  it("предложение, несколько строк или длинный абзац — нет", () => {
    expect(isHeadingParagraph("Он сказал так.")).toBe(false);
    expect(isHeadingParagraph("Шрила Прабхупада:")).toBe(false);
    expect(isHeadingParagraph("строка\nвторая")).toBe(false);
    expect(isHeadingParagraph("а".repeat(91))).toBe(false);
  });
});

describe("entryOutline (VED-538)", () => {
  const body = (n: number) => `Абзац текста номер ${n}. `.repeat(8);

  it("разделы — по заголовкам, без названия в первом абзаце", () => {
    const paragraphs = [
      "Пурушоттама-врата и отречение",
      body(1),
      "Часть первая",
      body(2),
      "Часть вторая",
      body(3),
    ];
    expect(entryOutline(paragraphs)).toEqual([
      { index: 2, title: "Часть первая" },
      { index: 4, title: "Часть вторая" },
    ]);
  });

  it("без заголовков длинный текст делится на части по началу абзаца", () => {
    const paragraphs = Array.from({ length: 16 }, (_, n) => body(n));
    const outline = entryOutline(paragraphs);
    expect(outline.map((item) => item.index)).toEqual([0, 4, 8, 12]);
    expect(outline[1].title.startsWith("Абзац текста номер 4.")).toBe(true);
    expect(outline[1].title.endsWith("…")).toBe(true);
  });

  it("короткий текст без заголовков — содержания нет", () => {
    expect(entryOutline([body(1), body(2), body(3)])).toEqual([]);
  });
});
