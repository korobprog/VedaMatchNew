import { describe, expect, it } from "vitest";
import {
  categoryLink,
  feedStyleOf,
  isPinnedCard,
  parseReelsTab,
  reelsHref,
} from "./feed-style";

describe("categoryLink", () => {
  it("ведёт в ленту своей папки и называет её словами", () => {
    expect(
      categoryLink({
        category: "poslovitsy",
        categoryTitle: "Пословицы",
        captionInImage: false,
      }),
    ).toEqual({ title: "Пословицы", href: "/motivation?category=poslovitsy" });
  });

  it("открытку ведёт в «Открытки» той же папки", () => {
    expect(
      categoryLink({
        category: "poslovitsy",
        categoryTitle: "Пословицы",
        captionInImage: true,
      })?.href,
    ).toBe("/motivation?tab=cards&category=poslovitsy");
  });

  it("не показывает слаг, которого справочник не знает", () => {
    expect(
      categoryLink({ category: "daily", categoryTitle: "daily", captionInImage: false }),
    ).toBeNull();
    expect(
      categoryLink({ category: "daily", categoryTitle: " ", captionInImage: false }),
    ).toBeNull();
  });
});

describe("isPinnedCard", () => {
  const card = { slug: "picture-1", captionInImage: true };

  it("ссылка на открытку ведёт в «Открытки»", () => {
    expect(isPinnedCard("picture-1", card)).toBe(true);
  });

  it("ссылка на нейрокартинку остаётся в «Для вас»", () => {
    expect(
      isPinnedCard("daily-1", { slug: "daily-1", captionInImage: false }),
    ).toBe(false);
  });

  it("без ссылки или когда пост не нашёлся — ничего не меняем", () => {
    expect(isPinnedCard(undefined, card)).toBe(false);
    // Опубликованного поста по ссылке нет: первой пришла чужая открытка.
    expect(isPinnedCard("gone", card)).toBe(false);
    expect(isPinnedCard("picture-1", undefined)).toBe(false);
  });
});

describe("parseReelsTab", () => {
  it("знает открытки и избранное, остальное — «Для вас»", () => {
    expect(parseReelsTab("cards")).toBe("cards");
    expect(parseReelsTab("saved")).toBe("saved");
    expect(parseReelsTab(undefined)).toBe("forYou");
    expect(parseReelsTab("что-то")).toBe("forYou");
  });
});

describe("feedStyleOf", () => {
  // VED-121: стили вместе не показывают.
  it("«Для вас» — нейросеть, «Открытки» — открытки, избранное — всё вместе", () => {
    expect(feedStyleOf("forYou")).toBe("art");
    expect(feedStyleOf("cards")).toBe("cards");
    expect(feedStyleOf("saved")).toBeUndefined();
  });
});

describe("reelsHref", () => {
  it("«Для вас» без параметров — просто лента", () => {
    expect(reelsHref({})).toBe("/motivation");
  });

  it("переносит порядок и папку во вкладку открыток", () => {
    expect(
      reelsHref({ tab: "cards", order: "random", category: "poslovitsy" }),
    ).toBe("/motivation?tab=cards&category=poslovitsy&order=random");
  });

  it("у избранного папки нет", () => {
    expect(reelsHref({ tab: "saved", category: "poslovitsy" })).toBe(
      "/motivation?tab=saved",
    );
  });

  it("открывает ленту на конкретной открытке", () => {
    expect(reelsHref({ tab: "cards", post: "picture-1" })).toBe(
      "/motivation?tab=cards&post=picture-1",
    );
  });
});
