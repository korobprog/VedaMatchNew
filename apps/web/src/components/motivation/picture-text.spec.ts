import { describe, expect, it } from "vitest";
import { needsFullQuote, pictureTextOf } from "./picture-text";

describe("pictureTextOf", () => {
  it("берёт поправленную надпись для картинки", () => {
    expect(pictureTextOf("  Коротко  ", "Длинная цитата")).toBe("Коротко");
  });

  // Прежнее поведение: у поста без отдельной надписи на картинке — цитата.
  it.each(["", "   ", undefined, null])("без надписи (%s) берёт цитату", (empty) => {
    expect(pictureTextOf(empty, "Цитата")).toBe("Цитата");
  });
});

describe("needsFullQuote", () => {
  it("не нужна короткой цитате без своей надписи", () => {
    expect(
      needsFullQuote({ pictureText: "Цитата", quote: "Цитата", clamped: false }),
    ).toBe(false);
  });

  it("нужна, когда надпись на картинке отличается от полного текста", () => {
    expect(
      needsFullQuote({ pictureText: "Коротко", quote: "Цитата", clamped: false }),
    ).toBe(true);
  });

  it("нужна обрезанной или длинной надписи", () => {
    expect(
      needsFullQuote({ pictureText: "Цитата", quote: "Цитата", clamped: true }),
    ).toBe(true);
    const long = "а".repeat(221);
    expect(
      needsFullQuote({ pictureText: long, quote: long, clamped: false }),
    ).toBe(true);
  });

  it("не нужна, когда полного текста нет вовсе", () => {
    expect(
      needsFullQuote({ pictureText: "Надпись", quote: "  ", clamped: false }),
    ).toBe(false);
  });

  it("не считает разницей пробелы по краям", () => {
    expect(
      needsFullQuote({ pictureText: "Цитата ", quote: " Цитата", clamped: false }),
    ).toBe(false);
  });
});
