import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("склоняет по русским правилам, включая подростковые числа", () => {
    const day = (n: number) => plural(n, "день", "дня", "дней");
    expect(day(1)).toBe("день");
    expect(day(2)).toBe("дня");
    expect(day(5)).toBe("дней");
    // 11..14 идут как «дней», хотя кончаются на 1..4.
    expect(day(11)).toBe("дней");
    expect(day(12)).toBe("дней");
    expect(day(21)).toBe("день");
    expect(day(22)).toBe("дня");
  });
});
