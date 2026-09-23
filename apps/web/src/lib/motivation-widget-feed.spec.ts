import { describe, expect, it, vi } from "vitest";
import type {
  MotivationCategoryDto,
  MotivationFeedResponse,
  MotivationPostDto,
} from "@vedamatch/shared";
import { loadWidgetFeed, widgetCategorySlug } from "./motivation-widget-feed";

const category = (title: string, slug: string) =>
  ({ id: slug, slug, title, sortOrder: 0, isDefault: false, parentId: null, postCount: 1 }) as MotivationCategoryDto;

const feedOf = (...texts: string[]): MotivationFeedResponse =>
  ({
    items: texts.map(
      (text, index) =>
        ({
          id: `p${index}`,
          slug: `p${index}`,
          text,
          title: "",
          captionInImage: false,
          feedTier: "unseen",
        }) as unknown as MotivationPostDto,
    ),
    nextCursor: null,
  }) as MotivationFeedResponse;

describe("widgetCategorySlug", () => {
  // VED-79, 22.09: «Мы переименовали категорию Философия в Мудрость Мира».
  // Слаг при переименовании остался прежним — по нему и ищем.
  it("находит папку по слагу, как бы её ни переименовали", () => {
    expect(
      widgetCategorySlug([
        category("Стихи Вед", "praktika-2"),
        category("Как угодно по-новому", "filosofiya-2"),
      ]),
    ).toBe("filosofiya-2");
  });

  it("слаг важнее названия: «Философия» с другим слагом не перебивает", () => {
    expect(
      widgetCategorySlug([
        category("Философия", "fil-old"),
        category("Мудрость мира", "filosofiya-2"),
      ]),
    ).toBe("filosofiya-2");
  });

  it("папку завели заново с другим слагом — находит по нынешнему названию", () => {
    expect(
      widgetCategorySlug([category("Веды", "vedy"), category(" мудрость  МИРА ", "mudrost")]),
    ).toBe("mudrost");
  });

  it("нынешнее название важнее прежнего", () => {
    expect(
      widgetCategorySlug([category("Философия", "fil"), category("Мудрость мира", "mudrost")]),
    ).toBe("mudrost");
  });

  it("прежнее название «Философия» — запасной путь", () => {
    expect(
      widgetCategorySlug([category("Веды", "vedy"), category(" философия ", "fil")]),
    ).toBe("fil");
  });

  it("нет такой папки — нет слага", () => {
    expect(widgetCategorySlug([category("Веды", "vedy")])).toBeNull();
    expect(widgetCategorySlug(null)).toBeNull();
    expect(widgetCategorySlug([])).toBeNull();
  });
});

describe("loadWidgetFeed", () => {
  it("берёт афоризм из «Мудрости мира»", async () => {
    const feed = vi.fn(async (slug?: string) =>
      slug ? feedOf("Познай самого себя.") : feedOf("Личное"),
    );

    const result = await loadWidgetFeed({
      categories: async () => [category("Мудрость мира", "filosofiya-2")],
      feed,
    });

    expect(feed).toHaveBeenCalledWith("filosofiya-2");
    expect(result.feed?.items[0].text).toBe("Познай самого себя.");
    // VED-401: нажатие на цитату открывает её внутри этой папки.
    expect(result.category).toBe("filosofiya-2");
  });

  // Пустая карточка хуже, чем не тот афоризм.
  it("пустая папка — откат к личной ленте", async () => {
    const feed = vi.fn(async (slug?: string) =>
      slug ? feedOf() : feedOf("Личное"),
    );

    const result = await loadWidgetFeed({
      categories: async () => [category("Мудрость мира", "filosofiya-2")],
      feed,
    });

    expect(feed).toHaveBeenLastCalledWith();
    expect(result.feed?.items[0].text).toBe("Личное");
    expect(result.category).toBeNull();
  });

  it("категории не загрузились — личная лента, как раньше", async () => {
    const feed = vi.fn(async () => feedOf("Личное"));

    const result = await loadWidgetFeed({
      categories: async () => {
        throw new Error("down");
      },
      feed,
    });

    expect(feed).toHaveBeenCalledWith();
    expect(result.feed?.items[0].text).toBe("Личное");
    expect(result.category).toBeNull();
  });
});
