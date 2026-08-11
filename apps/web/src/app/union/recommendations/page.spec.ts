import { describe, expect, it } from "vitest";
import { withPage } from "./page";

describe("withPage", () => {
  it("keeps every selected goal when turning the page", () => {
    const query = withPage({ intentions: ["family", "service"] }, 2);

    expect(query).toContain("intentions=family");
    expect(query).toContain("intentions=service");
    expect(query).toContain("page=2");
  });

  it("replaces the previous page number", () => {
    expect(withPage({ page: "3", city: "Москва" }, 4)).toContain("page=4");
    expect(withPage({ page: "3" }, 4)).not.toContain("page=3");
  });
});
