import { describe, expect, it } from "vitest";
import {
  blogCategoryAssignLabel,
  blogCategoryAssignOptions,
  blogCategoryFilterLabel,
  blogCategoryFilterOptions,
  blogCategoryLabel,
  blogFeedHref,
  blogLineageFilterLabel,
  parseBlogFeedFilters,
} from "./blog-feed-filters";

/* VED-590: «Категории постов должны быть следующие: Все, Знания, Новости,
   Жизнь преданных, Календарь». */
describe("категории Блог-ленты", () => {
  it("фильтр: «Все» и четыре категории в порядке карточки", () => {
    expect(blogCategoryFilterOptions().map((item) => item.label)).toEqual([
      "Все",
      "Знания",
      "Новости",
      "Жизнь преданных",
      "Календарь",
    ]);
    expect(blogCategoryFilterOptions()[0].value).toBe("");
  });

  it("назначение: только категории, без «Все» и «Без категории»", () => {
    const options = blogCategoryAssignOptions();
    expect(options.map((item) => item.value)).toEqual([
      "knowledge",
      "news",
      "devotee_life",
      "calendar",
    ]);
  });

  it("подпись категории и её отсутствия", () => {
    expect(blogCategoryLabel("devotee_life")).toBe("Жизнь преданных");
    expect(blogCategoryLabel(null)).toBeNull();
    expect(blogCategoryLabel("sport")).toBeNull();
  });

  it("имена кнопок говорят, что выбрано", () => {
    expect(blogCategoryFilterLabel(null)).toBe("Категории постов: все");
    expect(blogCategoryFilterLabel("news")).toBe("Категории постов: Новости");
    expect(blogCategoryAssignLabel(undefined)).toBe(
      "Назначить категорию: без категории",
    );
    expect(blogCategoryAssignLabel("calendar")).toBe(
      "Назначить категорию: Календарь",
    );
    expect(blogLineageFilterLabel(null)).toBe(
      "Фильтр по организациям: все линии",
    );
    expect(blogLineageFilterLabel("group:gaudiya_math")).toBe(
      "Фильтр по организациям: Гаудия-матх",
    );
  });
});

describe("parseBlogFeedFilters", () => {
  it("читает категорию и линию из адреса", () => {
    expect(
      parseBlogFeedFilters({ category: "news", lineage: "group:parivara" }),
    ).toEqual({ category: "news", lineage: "group:parivara" });
    expect(parseBlogFeedFilters({ lineage: "iskcon" })).toEqual({
      category: null,
      lineage: "iskcon",
    });
  });

  it("мусор — без фильтра, а не пустая лента", () => {
    expect(parseBlogFeedFilters({ category: "sport", lineage: "all" })).toEqual(
      { category: null, lineage: null },
    );
    expect(parseBlogFeedFilters({ category: ["knowledge", "news"] })).toEqual({
      category: "knowledge",
      lineage: null,
    });
  });
});

describe("blogFeedHref", () => {
  it("ставит фильтр и сохраняет вкладку и второй фильтр", () => {
    expect(
      blogFeedHref("/blog", "?view=favorites&lineage=iskcon", {
        category: "news",
      }),
    ).toBe("/blog?view=favorites&lineage=iskcon&category=news");
  });

  it("снимает фильтр значением null", () => {
    expect(
      blogFeedHref("/blog", "?category=news&lineage=iskcon", {
        category: null,
      }),
    ).toBe("/blog?lineage=iskcon");
    expect(blogFeedHref("/blog", "?category=news", { category: null })).toBe(
      "/blog",
    );
  });

  it("не переносит курсор и раскрытую форму", () => {
    expect(
      blogFeedHref("/blog", "?new=1&cursor=abc", { lineage: "iskcon" }),
    ).toBe("/blog?lineage=iskcon");
  });
});

/* VED-687: поиск по блог-ленте из адреса. */
describe("parseBlogFeedFilters: поиск", () => {
  it("читает содержание и автора, пробелы схлопнуты", () => {
    expect(
      parseBlogFeedFilters({ q: "  карма  йога ", author: "Радха" }),
    ).toEqual({
      category: null,
      lineage: null,
      q: "карма йога",
      author: "Радха",
    });
  });

  it("одна буква — не поиск", () => {
    expect(parseBlogFeedFilters({ q: "к" })).toEqual({
      category: null,
      lineage: null,
    });
  });
});
