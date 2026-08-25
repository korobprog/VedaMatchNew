import { describe, expect, it } from "vitest";
import { formatDimensions, formatWeight } from "./listing-dimensions";

describe("formatDimensions", () => {
  it("joins the measurements the seller actually filled in", () => {
    expect(
      formatDimensions({ lengthCm: 30, widthCm: 20, heightCm: 5 }, "см"),
    ).toBe("30 × 20 × 5 см");
    expect(
      formatDimensions({ lengthCm: 30, widthCm: 20, heightCm: null }, "см"),
    ).toBe("30 × 20 см");
    expect(
      formatDimensions({ lengthCm: 30, widthCm: null, heightCm: null }, "см"),
    ).toBe("30 см");
  });

  // Пропуск в середине не должен превращаться в прочерк: «30 × 5» честнее,
  // чем «30 × — × 5», где непонятно, что именно не измерено.
  it("closes the gap when a middle measurement is missing", () => {
    expect(
      formatDimensions({ lengthCm: 30, widthCm: null, heightCm: 5 }, "см"),
    ).toBe("30 × 5 см");
  });

  it("returns null when nothing was measured", () => {
    expect(
      formatDimensions({ lengthCm: null, widthCm: null, heightCm: null }, "см"),
    ).toBeNull();
  });
});

describe("formatWeight", () => {
  it("keeps grams below a kilogram", () => {
    expect(formatWeight(450, "г", "кг", "ru")).toBe("450 г");
    expect(formatWeight(999, "г", "кг", "ru")).toBe("999 г");
  });

  it("switches to kilograms from a kilogram up", () => {
    expect(formatWeight(1000, "г", "кг", "ru")).toBe("1 кг");
    expect(formatWeight(3200, "г", "кг", "ru")).toBe("3,2 кг");
  });

  // Округление до сотых: 1234 г — это 1,23 кг, а не 1,234.
  it("rounds kilograms to two decimals and drops a zero tail", () => {
    expect(formatWeight(1234, "г", "кг", "ru")).toBe("1,23 кг");
    expect(formatWeight(2000, "г", "кг", "ru")).toBe("2 кг");
  });

  it("returns null when the weight is unknown", () => {
    expect(formatWeight(null, "г", "кг", "ru")).toBeNull();
  });
});
