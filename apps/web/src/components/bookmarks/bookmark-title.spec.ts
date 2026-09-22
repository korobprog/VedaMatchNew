import { describe, expect, it } from "vitest";
import {
  bookmarkService,
  bookmarkServiceLabel,
  bookmarkTitleFrom,
} from "./bookmark-title";

describe("bookmarkTitleFrom", () => {
  it("снимает хвост портала", () => {
    expect(bookmarkTitleFrom("Шрила Прабхупада — VedaMatch", "/music/1")).toBe(
      "Шрила Прабхупада",
    );
  });

  it("оставляет заголовок без хвоста как есть", () => {
    expect(bookmarkTitleFrom("Планировщик", "/work")).toBe("Планировщик");
  });

  it("схлопывает пробелы", () => {
    expect(bookmarkTitleFrom("  Рынок\n  Корзина ", "/market/cart")).toBe(
      "Рынок Корзина",
    );
  });

  it("без заголовка подписью становится путь", () => {
    expect(bookmarkTitleFrom("   ", "/work/boards/1")).toBe("/work/boards/1");
    expect(bookmarkTitleFrom(" — VedaMatch", "/work")).toBe("/work");
  });
});

describe("bookmarkService", () => {
  it("берёт первый сегмент", () => {
    expect(bookmarkService("/music/artists/1")).toBe("music");
  });

  it("у главной раздела нет", () => {
    expect(bookmarkService("/")).toBe("");
  });
});

describe("bookmarkServiceLabel", () => {
  it("знает сервисы каталога", () => {
    expect(bookmarkServiceLabel("music")).toBe("Музыка");
    expect(bookmarkServiceLabel("work")).toBe("Работа");
  });

  it("незнакомое и пустое — «Портал»", () => {
    expect(bookmarkServiceLabel("")).toBe("Портал");
    expect(bookmarkServiceLabel("rewards")).toBe("Портал");
  });

  it("берёт имя из каталога, когда его передали", () => {
    expect(bookmarkServiceLabel("music", () => "Музыка")).toBe("Музыка");
  });
});
