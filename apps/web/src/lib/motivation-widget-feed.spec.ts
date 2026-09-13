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
  it("находит «Философию» по названию, а не по слагу", () => {
    expect(
      widgetCategorySlug([category("Веды", "vedy"), category(" философия ", "fil")]),
    ).toBe("fil");
  });

  it("нет такой папки — нет слага", () => {
    expect(widgetCategorySlug([category("Веды", "vedy")])).toBeNull();
    expect(widgetCategorySlug(null)).toBeNull();
  });
});

describe("loadWidgetFeed", () => {
  it("берёт афоризм из «Философии»", async () => {
    const feed = vi.fn(async (slug?: string) =>
      slug ? feedOf("Познай самого себя.") : feedOf("Личное"),
    );

    const result = await loadWidgetFeed({
      categories: async () => [category("Философия", "filosofiya")],
      feed,
    });

    expect(feed).toHaveBeenCalledWith("filosofiya");
    expect(result?.items[0].text).toBe("Познай самого себя.");
  });

  // Пустая карточка хуже, чем не тот афоризм.
  it("пустая «Философия» — откат к личной ленте", async () => {
    const feed = vi.fn(async (slug?: string) =>
      slug ? feedOf() : feedOf("Личное"),
    );

    const result = await loadWidgetFeed({
      categories: async () => [category("Философия", "filosofiya")],
      feed,
    });

    expect(feed).toHaveBeenLastCalledWith();
    expect(result?.items[0].text).toBe("Личное");
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
    expect(result?.items[0].text).toBe("Личное");
  });
});
