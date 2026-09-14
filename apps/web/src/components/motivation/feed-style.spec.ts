import { describe, expect, it } from "vitest";
import {
  categoryLink,
  feedCategoryButtons,
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

describe("feedCategoryButtons (VED-135)", () => {
  const cat = (
    slug: string,
    title: string,
    sortOrder: number,
    postCount = 3,
    parentId: string | null = null,
  ) => ({ id: slug, slug, title, sortOrder, postCount, parentId });

  it("непустые папки в порядке дерева: верхняя, за ней её подпапки", () => {
    const buttons = feedCategoryButtons(
      [
        cat("acharyas", "Ачарьи", 2),
        cat("guru", "Гуру", 1),
        cat("empty", "Пустая", 0, 0),
        cat("vaishnavas", "Вайшнавы", 3, 5, "acharyas"),
      ],
      { tab: "forYou" },
    );

    expect(buttons).toEqual([
      { slug: "guru", title: "Гуру", href: "/motivation?category=guru", current: false },
      {
        slug: "acharyas",
        title: "Ачарьи",
        href: "/motivation?category=acharyas",
        current: false,
      },
      {
        slug: "vaishnavas",
        title: "Вайшнавы",
        href: "/motivation?category=vaishnavas",
        current: false,
      },
    ]);
  });

  // Так на проде: верхняя «Общая» пустая, всё опубликованное — в подпапках.
  it("пустая верхняя папка не прячет свои непустые подпапки", () => {
    const buttons = feedCategoryButtons(
      [
        cat("verified_quote", "Общая", 0, 0),
        cat("praktika-2", "Веды", 20, 10, "verified_quote"),
        cat("filosofiya-2", "Философия", 10, 3, "verified_quote"),
        cat("poslovicy", "Пословицы", 50, 0, "verified_quote"),
      ],
      { tab: "forYou" },
    );

    expect(buttons.map((button) => button.title)).toEqual(["Философия", "Веды"]);
  });

  it("подпапка, чей родитель не пришёл, остаётся в кнопках", () => {
    const buttons = feedCategoryButtons([cat("orphan", "Сирота", 1, 2, "gone")], {
      tab: "forYou",
    });

    expect(buttons.map((button) => button.slug)).toEqual(["orphan"]);
  });

  it("не уводит из «Открыток» в другую ленту и помнит порядок", () => {
    const [button] = feedCategoryButtons([cat("guru", "Гуру", 1)], {
      tab: "cards",
      order: "random",
    });

    expect(button.href).toBe("/motivation?tab=cards&category=guru&order=random");
  });

  it("из избранного ведёт в «Для вас»: у избранного папок нет", () => {
    const [button] = feedCategoryButtons([cat("guru", "Гуру", 1)], { tab: "saved" });

    expect(button.href).toBe("/motivation?category=guru");
  });

  it("отмечает папку, которую сейчас смотрят", () => {
    const buttons = feedCategoryButtons(
      [cat("guru", "Гуру", 1), cat("acharyas", "Ачарьи", 2)],
      { tab: "forYou", current: "acharyas" },
    );

    expect(buttons.map((button) => button.current)).toEqual([false, true]);
  });
});
