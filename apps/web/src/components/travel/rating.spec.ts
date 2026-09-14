import { describe, expect, it } from "vitest";
import {
  formatAverage,
  ratingLabel,
  reviewsWord,
  starsLabel,
  starsText,
} from "./rating";

describe("ratingLabel", () => {
  it("средняя с запятой и число отзывов", () => {
    expect(ratingLabel({ average: 4.6, count: 12 })).toBe("4,6 · 12 отзывов");
  });

  it("без отзывов — словами", () => {
    expect(ratingLabel({ average: null, count: 0 })).toBe("Отзывов пока нет");
  });
});

describe("formatAverage", () => {
  it("целая оценка тоже с одним знаком", () => {
    expect(formatAverage(5)).toBe("5,0");
  });
});

describe("reviewsWord", () => {
  it.each([
    [1, "1 отзыв"],
    [3, "3 отзыва"],
    [11, "11 отзывов"],
    [21, "21 отзыв"],
  ])("%i → %s", (count, text) => {
    expect(reviewsWord(count)).toBe(text);
  });
});

describe("звёзды", () => {
  it("строка из пяти знаков", () => {
    expect(starsText(4)).toBe("★★★★☆");
    expect(starsText(4.6)).toBe("★★★★★");
  });

  it("подпись для скринридера", () => {
    expect(starsLabel(1)).toBe("1 звезда из 5");
    expect(starsLabel(4)).toBe("4 звезды из 5");
    expect(starsLabel(5)).toBe("5 звёзд из 5");
  });
});
