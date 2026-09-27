import { describe, expect, it } from "vitest";
import { bookmarkLinks, type LibraryBookmarkItem } from "./bookmarks-list";

function item(
  id: string,
  titleRu: string | null,
  titleEn: string | null = null,
): LibraryBookmarkItem {
  return {
    id,
    type: "article",
    titleRu,
    titleEn,
    bookmarkedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("bookmarkLinks", () => {
  it("keeps the full title and links to the entry", () => {
    const long =
      "Очень длинное название материала о служении, которое нельзя обрезать";
    expect(bookmarkLinks("ru", [item("e1", long)])).toEqual([
      { id: "e1", href: "/library/entry/e1", title: long },
    ]);
  });

  it("picks the interface language and falls back to the other one", () => {
    const links = bookmarkLinks("en", [
      item("e1", "Веды", "Vedas"),
      item("e2", "Катха", null),
    ]);
    expect(links.map((link) => link.title)).toEqual(["Vedas", "Катха"]);
  });

  it("never leaves a link without a name", () => {
    expect(bookmarkLinks("ru", [item("e1", " ", null)])[0].title).toBe(
      "Материал без названия",
    );
  });

  it("keeps the server order", () => {
    const links = bookmarkLinks("ru", [item("b", "Б"), item("a", "А")]);
    expect(links.map((link) => link.id)).toEqual(["b", "a"]);
  });
});
