import { describe, expect, it } from "vitest";
import {
  editHref,
  filterByKind,
  kindHref,
  parsePostKind,
  postKindOf,
} from "./post-kind";

describe("post-kind (VED-299)", () => {
  const art = { id: "a", captionInImage: false };
  const card = { id: "c", captionInImage: true };

  it("разбирает вид из адреса, чужое — без вида", () => {
    expect(parsePostKind("art")).toBe("art");
    expect(parsePostKind("cards")).toBe("cards");
    expect(parsePostKind("reels")).toBeUndefined();
    expect(parsePostKind(["cards"])).toBeUndefined();
    expect(parsePostKind(undefined)).toBeUndefined();
  });

  it("открытка — cards, остальное — art", () => {
    expect(postKindOf(card)).toBe("cards");
    expect(postKindOf(art)).toBe("art");
  });

  it("сужает список до одного вида, без вида — все", () => {
    expect(filterByKind([art, card], "art")).toEqual([art]);
    expect(filterByKind([art, card], "cards")).toEqual([card]);
    expect(filterByKind([art, card], undefined)).toEqual([art, card]);
  });

  it("адреса переключателя и «Править»", () => {
    expect(kindHref("/admin/motivation/published", "cards")).toBe(
      "/admin/motivation/published?kind=cards",
    );
    expect(kindHref("/admin/motivation/hidden", undefined)).toBe(
      "/admin/motivation/hidden",
    );
    expect(editHref({ slug: "gita 2.7", captionInImage: true })).toBe(
      "/admin/motivation/published?post=gita+2.7&kind=cards",
    );
    expect(editHref({ slug: "x", captionInImage: false })).toBe(
      "/admin/motivation/published?post=x&kind=art",
    );
  });
});
