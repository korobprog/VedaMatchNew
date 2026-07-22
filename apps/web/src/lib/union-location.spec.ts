import { describe, expect, it } from "vitest";
import { hasCompleteUnionLocation } from "./union-location";

describe("hasCompleteUnionLocation", () => {
  it("requires country, city and valid coordinates", () => {
    expect(hasCompleteUnionLocation({ homeLocation: null })).toBe(false);
    expect(
      hasCompleteUnionLocation({
        homeLocation: {
          city: "Хабаровск",
          lat: 48.4813,
          lon: 135.0763,
        },
      }),
    ).toBe(false);
    expect(
      hasCompleteUnionLocation({
        homeLocation: {
          city: "Хабаровск",
          country: "Россия",
          lat: 48.4813,
          lon: 135.0763,
        },
      }),
    ).toBe(true);
  });
});
