import { describe, expect, it } from "vitest";
import { pickBubbleInk } from "./chat-contrast-ink";

describe("pickBubbleInk", () => {
  it("на белом фоне выбирает тёмный текст", () => {
    expect(pickBubbleInk("#FFFFFF")).toBe("#0A0614");
  });

  it("на чёрном фоне выбирает светлый текст", () => {
    expect(pickBubbleInk("#000000")).toBe("#F6F1FF");
  });

  it("на среднем сером фоне выбирает светлый текст", () => {
    // Относительная яркость #808080 по WCAG ≈ 0.216 — ниже порога 0.4.
    expect(pickBubbleInk("#808080")).toBe("#F6F1FF");
  });

  it("на насыщенном цвете темы (циан) выбирает тёмный текст", () => {
    expect(pickBubbleInk("#23F0C7")).toBe("#0A0614");
  });

  it("некорректный hex не роняет расчёт", () => {
    expect(pickBubbleInk("не-цвет")).toBe("#0A0614");
  });
});
