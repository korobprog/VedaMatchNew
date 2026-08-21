import { describe, expect, it } from "vitest";
import { reelLinkFor } from "./annotation-toolbar";

describe("reelLinkFor", () => {
  it("builds the motivation wizard link with book, chapter and trimmed text", () => {
    const href = reelLinkFor({ bookSlug: "bg", chapterSlug: "2", text: "  Ты имеешь право лишь на действие.  " });
    const url = new URL(href, "https://vedamatch.app");

    expect(url.pathname).toBe("/motivation/create");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: "vedabase",
      book: "bg",
      chapter: "2",
      text: "Ты имеешь право лишь на действие.",
    });
  });
});
