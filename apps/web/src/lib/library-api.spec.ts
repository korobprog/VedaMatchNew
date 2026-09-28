import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const { categoryViewQuery } = await import("./library-api");

describe("categoryViewQuery (VED-621)", () => {
  it("без вида — всё дерево, без параметров", () => {
    expect(categoryViewQuery(undefined)).toBe("");
    expect(categoryViewQuery({ filtered: false, lineage: "iskcon" })).toBe("");
  });

  it("просмотр — по фильтрам зрителя и с явной линией из адреса", () => {
    expect(categoryViewQuery({ filtered: true })).toBe("?filtered=true");
    expect(categoryViewQuery({ filtered: true, lineage: null })).toBe(
      "?filtered=true",
    );
    expect(
      categoryViewQuery({ filtered: true, lineage: "group:gaudiya_math" }),
    ).toBe("?filtered=true&lineage=group%3Agaudiya_math");
  });
});
