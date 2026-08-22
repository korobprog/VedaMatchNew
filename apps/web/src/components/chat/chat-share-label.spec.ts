import { describe, expect, it } from "vitest";
import { shareSourceLabel } from "./chat-share-label";

describe("shareSourceLabel", () => {
  it("называет сервис-источник карточки", () => {
    expect(shareSourceLabel("story")).toBe("Сторис · Мотивация");
    expect(shareSourceLabel("notice")).toBe("Объявление");
    expect(shareSourceLabel("listing")).toBe("Товар · Рынок");
  });

  it("для остального даёт нейтральную подпись, а не пустую строку", () => {
    expect(shareSourceLabel("contact")).toBe("Карточка");
    expect(shareSourceLabel("image")).toBe("Карточка");
  });
});
