import { describe, expect, it } from "vitest";
import { toQueryString } from "./union-api";

describe("toQueryString", () => {
  it("repeats a parameter given several values", () => {
    expect(toQueryString({ intentions: ["family", "service"] })).toBe(
      "?intentions=family&intentions=service",
    );
  });

  it("keeps a single value as it was", () => {
    expect(toQueryString({ city: "Москва" })).toBe(
      `?city=${encodeURIComponent("Москва")}`,
    );
  });

  it("returns an empty string without parameters", () => {
    expect(toQueryString({})).toBe("");
  });
});
