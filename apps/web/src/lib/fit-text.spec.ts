import { describe, expect, it } from "vitest";
import { pickFittingOption } from "./fit-text";

// Шесть пикселей на знак — порядок величины 11px Manrope на кириллице.
const measure = (text: string) => text.length * 6;

describe("pickFittingOption", () => {
  const options = ["Работа · Доска", "Доска"];

  it("широкая плитка — полное название", () => {
    expect(pickFittingOption(options, 90, measure)).toBe(0);
  });

  it("узкая плитка — короткое", () => {
    expect(pickFittingOption(options, 70, measure)).toBe(1);
  });

  it("не влез ни один — самый короткий, его дорежет CSS", () => {
    expect(pickFittingOption(options, 10, measure)).toBe(1);
  });

  it("впритык — влезает: дробные пиксели не гоняют подпись туда-сюда", () => {
    expect(pickFittingOption(options, 83.6, measure)).toBe(0);
  });

  it("пустой список — нечего выбирать", () => {
    expect(pickFittingOption([], 100, measure)).toBe(-1);
  });
});
