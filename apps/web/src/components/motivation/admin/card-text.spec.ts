import { describe, expect, it } from "vitest";
import { cardText, expandHint } from "./card-text";

const base = {
  text: "Душа не умирает\n\nПояснение к стиху",
  title: "Заголовок",
  slug: "gita-2-13",
  attributionSpeaker: "Прабхупада",
  attributionWork: "Бхагавад-гита",
  attributionLocator: "2.13",
};

describe("cardText (VED-264)", () => {
  it("делит текст на афоризм, пояснение и подпись", () => {
    expect(cardText(base)).toEqual({
      quote: "Душа не умирает",
      explanation: "Пояснение к стиху",
      attribution: "Прабхупада · Бхагавад-гита · 2.13",
    });
  });

  it("пустые части подписи не оставляют висячих разделителей", () => {
    expect(
      cardText({ ...base, attributionSpeaker: " ", attributionLocator: null })
        .attribution,
    ).toBe("Бхагавад-гита");
    expect(
      cardText({
        ...base,
        attributionSpeaker: null,
        attributionWork: null,
        attributionLocator: null,
      }).attribution,
    ).toBe("");
  });

  it("без пояснения — пустая строка, а не пустой блок", () => {
    expect(cardText({ ...base, text: "Только цитата" }).explanation).toBe("");
  });

  // У открытки текст бывает пустым: цитата напечатана на самой картинке.
  it("открытка без текста — заголовок, без заголовка — слаг", () => {
    expect(cardText({ ...base, text: "" }).quote).toBe("Заголовок");
    expect(cardText({ ...base, text: "", title: "  " }).quote).toBe("gita-2-13");
  });
});

describe("expandHint", () => {
  it("подсказка зеркальна состоянию", () => {
    expect(expandHint(false)).toBe("Показать полностью");
    expect(expandHint(true)).toBe("Свернуть");
  });
});
