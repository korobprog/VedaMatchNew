import { describe, expect, it } from "vitest";
import { buildLibraryQuery } from "./library-query";

describe("buildLibraryQuery", () => {
  it("keeps only filled values and takes the first of arrays", () => {
    expect(
      buildLibraryQuery({
        type: "video",
        language: "",
        sort: undefined,
        categorySlug: ["philosophy", "extra"],
      }),
    ).toBe("?type=video&categorySlug=philosophy");
  });

  it("returns an empty string when there is nothing to send", () => {
    expect(buildLibraryQuery({})).toBe("");
    expect(buildLibraryQuery(undefined)).toBe("");
  });

  it("encodes values", () => {
    expect(buildLibraryQuery({ q: "бхагавад гита" })).toBe(
      "?q=%D0%B1%D1%85%D0%B0%D0%B3%D0%B0%D0%B2%D0%B0%D0%B4+%D0%B3%D0%B8%D1%82%D0%B0",
    );
  });
});
