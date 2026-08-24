import { describe, expect, it } from "vitest";
import { isLongQuote } from "./quote-text";

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
