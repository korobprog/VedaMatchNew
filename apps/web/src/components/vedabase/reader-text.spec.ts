import { describe, expect, it } from "vitest";
import { sanskritSegments, unitHeading } from "./reader-text";

/* VED-683: раздел стиха в читалке. */
describe("unitHeading", () => {
  it("название книги меняется на «Текст»", () => {
    expect(unitHeading("Бхагавад-гита 2.66")).toBe("Текст 2.66");
    expect(unitHeading("Шримад-Бхагаватам 1.2.6")).toBe("Текст 1.2.6");
    expect(unitHeading("Бхагавад-гита 2.62-63")).toBe("Текст 2.62-63");
  });

  it("без номера — как было", () => {
    expect(unitHeading("Вступление")).toBe("Вступление");
    expect(unitHeading("12")).toBe("12");
  });
});

describe("sanskritSegments", () => {
  it("санскрит до тире — жирным, текст не меняется", () => {
    const text = "на-асти — не существует; буддхих̣ — духовный разум";
    const segments = sanskritSegments(text);
    expect(segments.map((s) => s.text).join("")).toBe(text);
    expect(segments.filter((s) => s.bold).map((s) => s.text)).toEqual([
      "на-асти",
      "буддхих̣",
    ]);
  });

  it("без тире — ничего жирным", () => {
    expect(sanskritSegments("просто текст")).toEqual([
      { text: "просто текст", bold: false },
    ]);
  });
});
