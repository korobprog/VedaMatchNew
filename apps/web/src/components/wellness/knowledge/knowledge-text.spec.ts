import type { WellnessKnowledgeCategoryDto } from "@vedamatch/shared";
import { describe, expect, it } from "vitest";
import {
  articleCountLabel,
  COVER_MAX_BYTES,
  coverFileProblem,
  formatArticleDate,
  hasMoreArticles,
  parseArticleBody,
  parseInline,
  subcategoryCountLabel,
  totalArticles,
} from "./knowledge-text";

describe("parseArticleBody", () => {
  it("splits headings, paragraphs, lists and quotes", () => {
    const blocks = parseArticleBody(
      [
        "# Доши",
        "Вата, питта",
        "и капха.",
        "",
        "- Вата",
        "- Питта",
        "> Цитата",
        "## Итог",
        "### Мелко",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "Доши" },
      { type: "paragraph", text: "Вата, питта и капха." },
      { type: "list", items: ["Вата", "Питта"] },
      { type: "quote", text: "Цитата" },
      { type: "heading", level: 3, text: "Итог" },
      { type: "heading", level: 4, text: "Мелко" },
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(parseArticleBody(" \n\n ")).toEqual([]);
  });

  it("keeps markup-looking text as plain text", () => {
    expect(parseArticleBody("<script>alert(1)</script>")).toEqual([
      { type: "paragraph", text: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parseInline", () => {
  it("finds bold and http links", () => {
    expect(
      parseInline("Смотри **важное** и [источник](https://example.org/a)."),
    ).toEqual([
      { type: "text", text: "Смотри " },
      { type: "strong", text: "важное" },
      { type: "text", text: " и " },
      { type: "link", text: "источник", href: "https://example.org/a" },
      { type: "text", text: "." },
    ]);
  });

  it("ignores non-http links", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([
      { type: "text", text: "[x](javascript:alert(1))" },
    ]);
  });
});

describe("coverFileProblem", () => {
  it("accepts a small jpeg", () => {
    expect(coverFileProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
  });

  it("rejects other types and big files", () => {
    expect(coverFileProblem({ type: "image/gif", size: 10 })).toMatch(/JPEG/);
    expect(
      coverFileProblem({ type: "image/png", size: COVER_MAX_BYTES + 1 }),
    ).toMatch(/10 МБ/);
  });
});

describe("labels", () => {
  it("declines counts", () => {
    expect(articleCountLabel(1)).toBe("1 статья");
    expect(articleCountLabel(3)).toBe("3 статьи");
    expect(articleCountLabel(11)).toBe("11 статей");
    expect(subcategoryCountLabel(2)).toBe("2 подрубрики");
  });

  it("formats a date in Russian", () => {
    expect(formatArticleDate("2026-09-28T10:00:00.000Z")).toBe(
      "28 сентября 2026 г.",
    );
  });

  it("knows when more articles remain", () => {
    expect(
      hasMoreArticles({ items: [], total: 13, page: 1, pageSize: 12 }),
    ).toBe(true);
    expect(
      hasMoreArticles({ items: [], total: 12, page: 1, pageSize: 12 }),
    ).toBe(false);
  });
});

describe("totalArticles", () => {
  it("sums the whole subtree", () => {
    const node = (
      articleCount: number,
      children: WellnessKnowledgeCategoryDto[] = [],
    ): WellnessKnowledgeCategoryDto => ({
      id: String(articleCount),
      parentId: null,
      slug: "s",
      titleRu: "t",
      titleEn: null,
      descriptionRu: null,
      position: 0,
      articleCount,
      children,
    });
    expect(totalArticles(node(1, [node(2, [node(3)]), node(4)]))).toBe(10);
  });
});
