import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findLateVendorPrefixes } from "./css-vendor-order";

describe("findLateVendorPrefixes", () => {
  it("ловит стандартное свойство перед префиксным", () => {
    const css = [
      ".glass {",
      "  backdrop-filter: blur(24px);",
      "  -webkit-backdrop-filter: blur(24px);",
      "}",
    ].join("\n");

    expect(findLateVendorPrefixes(css)).toEqual([
      { property: "backdrop-filter", line: 2 },
    ]);
  });

  it("молчит на правильном порядке", () => {
    const css = [
      ".glass {",
      "  -webkit-backdrop-filter: blur(24px);",
      "  backdrop-filter: blur(24px);",
      "}",
    ].join("\n");

    expect(findLateVendorPrefixes(css)).toEqual([]);
  });

  it("не путает соседние блоки", () => {
    const css = ".a { backdrop-filter: blur(1px); } .b { -webkit-backdrop-filter: blur(1px); }";

    expect(findLateVendorPrefixes(css)).toEqual([]);
  });

  it("разбирает блоки внутри @media", () => {
    const css = [
      "@media (min-width: 40rem) {",
      "  .a {",
      "    mask-composite: exclude;",
      "    -webkit-mask-composite: xor;",
      "  }",
      "}",
    ].join("\n");

    expect(findLateVendorPrefixes(css)).toEqual([
      { property: "mask-composite", line: 3 },
    ]);
  });

  it("не считает ошибкой префиксный селектор без пары", () => {
    const css = "::-webkit-scrollbar { width: 8px; }";

    expect(findLateVendorPrefixes(css)).toEqual([]);
  });
});

describe("globals.css", () => {
  it("не теряет свойства из-за порядка префиксов", () => {
    const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

    expect(findLateVendorPrefixes(css)).toEqual([]);
  });
});
