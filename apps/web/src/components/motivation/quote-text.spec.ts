import { describe, expect, it } from "vitest";
import {
  isLongQuote,
  isTextClamped,
  joinQuoteAndExplanation,
  splitQuoteAndExplanation,
} from "./quote-text";

describe("isLongQuote", () => {
  it("короткую цитату не считает длинной", () => {
    expect(isLongQuote("Коротко")).toBe(false);
  });

  it("длинную цитату считает длинной", () => {
    const long = "Преданность освобождает ум от иллюзии. ".repeat(6);
    expect(isLongQuote(long)).toBe(true);
  });

  it("ровно на границе не считает длинной", () => {
    expect(isLongQuote("а".repeat(170))).toBe(false);
    expect(isLongQuote("а".repeat(171))).toBe(true);
  });
});

describe("isTextClamped", () => {
  it("текст, влезший целиком, обрезанным не считает", () => {
    expect(isTextClamped({ scrollHeight: 80, clientHeight: 80 })).toBe(false);
  });

  it("дробный пиксель обрезкой не считает", () => {
    expect(isTextClamped({ scrollHeight: 80.4, clientHeight: 80 })).toBe(false);
  });

  it("спрятанную строку считает обрезкой", () => {
    expect(isTextClamped({ scrollHeight: 100, clientHeight: 80 })).toBe(true);
  });

  it("скрытый блок обрезанным не считает: обе величины нулевые", () => {
    expect(isTextClamped({ scrollHeight: 0, clientHeight: 0 })).toBe(false);
  });
});

describe("joinQuoteAndExplanation", () => {
  it("склеивает через пустую строку", () => {
    expect(joinQuoteAndExplanation("Цитата", "Пояснение")).toBe(
      "Цитата\n\nПояснение",
    );
  });

  it("без пояснения разделителя не оставляет", () => {
    expect(joinQuoteAndExplanation("Цитата", "")).toBe("Цитата");
    expect(joinQuoteAndExplanation("Цитата", "   ")).toBe("Цитата");
  });

  it("склейка и разбор возвращают исходные части", () => {
    const parts = { quote: "Цитата", explanation: "Пояснение в две строки" };
    expect(
      splitQuoteAndExplanation(
        joinQuoteAndExplanation(parts.quote, parts.explanation),
      ),
    ).toEqual(parts);
  });

  it("пояснение из двух абзацев переживает круг", () => {
    const explanation = "Первый абзац.\n\nВторой абзац.";
    const text = joinQuoteAndExplanation("Цитата", explanation);
    expect(splitQuoteAndExplanation(text)).toEqual({
      quote: "Цитата",
      explanation,
    });
  });
});
