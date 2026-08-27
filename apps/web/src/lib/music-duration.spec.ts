import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatTotalDuration,
  formatTrackDuration,
} from "./music-duration";

describe("formatTrackDuration", () => {
  it("пишет время как на дорожке плеера", () => {
    expect(formatTrackDuration(198)).toBe("3:18");
    expect(formatTrackDuration(422)).toBe("7:02");
    expect(formatTrackDuration(132)).toBe("2:12");
  });

  it("не дополняет минуты нулём, пока нет часов", () => {
    expect(formatTrackDuration(65)).toBe("1:05");
  });

  it("с часами дополняет минуты нулём", () => {
    expect(formatTrackDuration(3720)).toBe("1:02:00");
    expect(formatTrackDuration(4360)).toBe("1:12:40");
  });

  it("ровный час не превращается в 60 минут", () => {
    expect(formatTrackDuration(3600)).toBe("1:00:00");
  });

  it("ноль и мусор не роняют карточку", () => {
    expect(formatTrackDuration(0)).toBe("0:00");
    expect(formatTrackDuration(-5)).toBe("0:00");
    expect(formatTrackDuration(Number.NaN)).toBe("0:00");
  });

  it("дробные секунды округляет вниз, а не показывает дробь", () => {
    expect(formatTrackDuration(198.7)).toBe("3:18");
  });
});

describe("formatTotalDuration", () => {
  it("до часа считает минутами", () => {
    expect(formatTotalDuration(3480)).toBe("58 мин");
    expect(formatTotalDuration(2460)).toBe("41 мин");
  });

  it("дальше часа — часы и минуты", () => {
    expect(formatTotalDuration(7800)).toBe("2 ч 10 мин");
  });

  it("ровные часы не тянут за собой «0 мин»", () => {
    expect(formatTotalDuration(10800)).toBe("3 ч");
  });

  it("секунды в подписи подборки не показывает", () => {
    expect(formatTotalDuration(3510)).toBe("59 мин");
  });

  it("пустая подборка — ноль минут, а не пустая строка", () => {
    expect(formatTotalDuration(0)).toBe("0 мин");
  });

  it("округление до часа не даёт «60 мин»", () => {
    expect(formatTotalDuration(3599)).toBe("1 ч");
  });
});

describe("formatBytes", () => {
  it("маленький файл не превращает в «0 МБ»", () => {
    expect(formatBytes(125_100)).toBe("122 КБ");
    expect(formatBytes(900)).toBe("900 Б");
  });

  it("мегабайты с одним знаком после запятой", () => {
    expect(formatBytes(4_800_000)).toBe("4.6 МБ");
  });

  it("гигабайты не показывает тысячами мегабайт", () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 ГБ");
  });

  it("пустое и мусор не роняют строку", () => {
    expect(formatBytes(0)).toBe("0 Б");
    expect(formatBytes(null)).toBe("0 Б");
    expect(formatBytes(undefined)).toBe("0 Б");
    expect(formatBytes(-5)).toBe("0 Б");
  });
});
