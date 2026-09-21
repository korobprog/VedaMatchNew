import { describe, expect, it } from "vitest";
import {
  bookmarkService,
  bookmarkServiceLabel,
  bookmarkTitleFrom,
  groupBookmarks,
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

describe("groupBookmarks", () => {
  it("складывает по разделам в порядке первого появления", () => {
    const groups = groupBookmarks(
      [
        { service: "music", id: 1 },
        { service: "work", id: 2 },
        { service: "music", id: 3 },
      ],
      (service) => service.toUpperCase(),
    );
    expect(groups.map((group) => group.service)).toEqual(["music", "work"]);
    expect(groups[0].items.map((item) => item.id)).toEqual([1, 3]);
    expect(groups[0].label).toBe("MUSIC");
  });

  it("пустой список — пустые группы", () => {
    expect(groupBookmarks([])).toEqual([]);
  });
});
