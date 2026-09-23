import { describe, expect, it } from "vitest";
import {
  audiobookMeta,
  audiobookResumeLabel,
  pausedPosition,
} from "./audiobook-labels";

describe("audiobookMeta", () => {
  it("главы и длительность через точку", () => {
    expect(audiobookMeta(12, 5 * 3600 + 20 * 60)).toBe("12 глав · 5 ч 20 мин");
  });

  it("числительное: 1 глава, 3 главы, 5 глав", () => {
    expect(audiobookMeta(1, 0)).toBe("1 глава");
    expect(audiobookMeta(3, 0)).toBe("3 главы");
    expect(audiobookMeta(5, 0)).toBe("5 глав");
  });

  it("пустая книга — пустая подпись, а не «0 глав · 0 мин»", () => {
    expect(audiobookMeta(0, 0)).toBe("");
  });
});

describe("audiobookResumeLabel", () => {
  it("с середины главы — с временем", () => {
    expect(
      audiobookResumeLabel({ trackId: "t", chapterNumber: 3, positionSeconds: 754 }),
    ).toBe("Продолжить: глава 3, с 12:34");
  });

  it("с начала главы — без «с 0:00»", () => {
    expect(
      audiobookResumeLabel({ trackId: "t", chapterNumber: 4, positionSeconds: 0 }),
    ).toBe("Продолжить: глава 4");
  });
});

describe("pausedPosition", () => {
  it("плеер ещё не загрузил файл — берём серверную позицию, а не ноль", () => {
    expect(pausedPosition(0, 754)).toBe(754);
  });

  it("плеер ушёл дальше — его позиция свежее", () => {
    expect(pausedPosition(812.6, 754)).toBe(812);
  });

  it("нигде ничего — с начала главы", () => {
    expect(pausedPosition(0, 0)).toBe(0);
  });
});
