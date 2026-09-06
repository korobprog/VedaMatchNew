import { describe, expect, it } from "vitest";
import type { AstroTodayDto } from "@vedamatch/shared";
import { buildAstroQuickAccess } from "./astro-quick-access";

const today = (over: Partial<AstroTodayDto> = {}): AstroTodayDto => ({
  forDate: "2026-09-06",
  moonBhava: 4,
  moonRashi: 2,
  moonNakshatra: 4,
  currentMahadasha: { lord: "jupiter" },
  currentAntardasha: { lord: "saturn" },
  text: null,
  ...over,
});

describe("buildAstroQuickAccess", () => {
  it("без данных дня — пусто", () => {
    expect(buildAstroQuickAccess(null)).toEqual({ moonLine: null, dashaLine: null });
  });

  it("собирает строку Луны с накшатрой, раши и домом, и строку даши", () => {
    expect(buildAstroQuickAccess(today())).toEqual({
      moonLine: "Луна в Рохини (Вришабха), 4-й дом",
      dashaLine: "Даша Гуру / Шани",
    });
  });

  it("не зависит от фразы ИИ: она может быть пустой", () => {
    expect(buildAstroQuickAccess(today({ text: null })).moonLine).not.toBeNull();
  });

  it("сломанный индекс накшатры — молчим, а не «Луна в undefined»", () => {
    expect(buildAstroQuickAccess(today({ moonNakshatra: 99 })).moonLine).toBeNull();
  });
});
