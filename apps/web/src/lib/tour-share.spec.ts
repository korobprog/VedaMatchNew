import { describe, expect, it } from "vitest";
import {
  isTourShareDismissed,
  tourChapterUrl,
  tourShareLink,
} from "./tour-share";

/* VED-653: «Поделиться» главой тура. */
describe("tourChapterUrl", () => {
  it("ведёт на главу по якорю", () => {
    expect(tourChapterUrl("https://vedamatch.ru", "union")).toBe(
      "https://vedamatch.ru/tour#union",
    );
    expect(tourChapterUrl("https://vedamatch.ru/", "union")).toBe(
      "https://vedamatch.ru/tour#union",
    );
  });
});

describe("tourShareLink", () => {
  const url = "https://vedamatch.ru/tour#union";
  const text = "Знакомства — видео:";

  it("кодирует ссылку и текст для Telegram", () => {
    const link = new URL(tourShareLink("telegram", url, text));
    expect(link.origin).toBe("https://t.me");
    expect(link.searchParams.get("url")).toBe(url);
    expect(link.searchParams.get("text")).toBe(text);
  });

  it("ВКонтакте получает адрес с якорем целиком", () => {
    const link = new URL(tourShareLink("vk", url, text));
    expect(link.hostname).toBe("vk.com");
    expect(link.searchParams.get("url")).toBe(url);
  });

  it("WhatsApp — одной строкой, ссылка в конце", () => {
    const link = new URL(tourShareLink("whatsapp", url, text));
    expect(link.searchParams.get("text")).toBe(`${text} ${url}`);
  });
});

describe("isTourShareDismissed", () => {
  it("закрытое окно — не ошибка", () => {
    expect(isTourShareDismissed(new DOMException("x", "AbortError"))).toBe(true);
    expect(isTourShareDismissed(new DOMException("x", "NotAllowedError"))).toBe(false);
    expect(isTourShareDismissed(new Error("x"))).toBe(false);
  });
});
