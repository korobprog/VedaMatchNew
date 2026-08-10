import { describe, expect, it } from "vitest";
import type { AstroCompleteness } from "@vedamatch/shared";
import { featuresUnlockedBy, nextStepHint } from "./astro-copy";
import { formatUtcOffset } from "./birth-data-form";

function completeness(
  overrides: Partial<AstroCompleteness> = {},
): AstroCompleteness {
  return {
    percent: 25,
    items: [],
    missing: ["birthPlace", "birthTime"],
    next: "birthPlace",
    features: [
      { key: "graha_signs", unlocked: true, requires: [] },
      { key: "moon_nakshatra", unlocked: false, requires: ["birthTime"] },
      { key: "dasha", unlocked: false, requires: ["birthTime"] },
      {
        key: "lagna",
        unlocked: false,
        requires: ["birthTime", "birthPlace"],
      },
    ],
    ...overrides,
  };
}

describe("featuresUnlockedBy", () => {
  it("возвращает разделы, которым не хватает только этого поля", () => {
    expect(featuresUnlockedBy(completeness(), "birthTime")).toEqual([
      "moon_nakshatra",
      "dasha",
    ]);
  });

  it("не обещает разделы, которым нужно ещё что-то помимо этого поля", () => {
    // Лагне нужны и время, и место — обещать её за одно поле было бы обманом.
    expect(featuresUnlockedBy(completeness(), "birthTime")).not.toContain(
      "lagna",
    );
  });

  it("не возвращает уже открытые разделы", () => {
    expect(featuresUnlockedBy(completeness(), "birthDate")).toEqual([]);
  });
});

describe("nextStepHint", () => {
  it("объясняет, зачем нужно следующее поле", () => {
    const hint = nextStepHint(completeness());
    expect(hint?.field).toBe("birthPlace");
    expect(hint?.reason).toBeTruthy();
  });

  it("молчит, когда заполнять больше нечего", () => {
    expect(nextStepHint(completeness({ next: null }))).toBeNull();
  });
});

describe("formatUtcOffset", () => {
  it("показывает целые часы без минут", () => {
    expect(formatUtcOffset(240)).toBe("UTC+4");
    expect(formatUtcOffset(180)).toBe("UTC+3");
  });

  it("показывает получасовые пояса", () => {
    expect(formatUtcOffset(330)).toBe("UTC+5:30");
  });

  it("показывает неполные исторические смещения", () => {
    // Местное среднее время до введения часовых поясов.
    expect(formatUtcOffset(53)).toBe("UTC+0:53");
  });

  it("показывает отрицательные смещения", () => {
    expect(formatUtcOffset(-300)).toBe("UTC−5");
  });

  it("не теряет знак у нулевого часа", () => {
    expect(formatUtcOffset(-30)).toBe("UTC−0:30");
  });
});
