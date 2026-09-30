import { describe, expect, it } from "vitest";
import { NAKSHATRA_NAMES } from "@vedamatch/shared";
import { chartBasis, formatUtcOffset } from "./astro-chart-basis";

/* VED-672: на что посчитана карта — чтобы расхождение данных было видно. */
describe("chartBasis", () => {
  const source = {
    birthDate: "1984-09-12",
    birthTime: "06:30",
    timezone: "Europe/Moscow",
    utcOffsetMinutes: 240,
    place: { label: "Москва" },
  };

  it("местное время, пояс со смещением и место", () => {
    const basis = chartBasis(source, 50);
    expect(basis.local).toBe("12.09.1984, 06:30");
    expect(basis.zone).toBe("UTC+04:00, Europe/Moscow");
    expect(basis.place).toBe("Москва");
  });

  it("Луна — накшатра и пройденная её часть", () => {
    // 50° = 3 накшатры (40°) + 10°: четвёртая, Рохини, 10°00′.
    expect(chartBasis(source, 50).moon).toBe(
      `${NAKSHATRA_NAMES[3]}, 10°00′ из 13°20′`,
    );
    expect(
      chartBasis(source, 359.99).moon.startsWith(NAKSHATRA_NAMES[26]),
    ).toBe(true);
  });

  it("время неизвестно и отрицательное смещение", () => {
    expect(chartBasis({ ...source, birthTime: null }, 0).local).toBe(
      "12.09.1984, время неизвестно",
    );
    expect(formatUtcOffset(-330)).toBe("UTC−05:30");
    expect(formatUtcOffset(0)).toBe("UTC+00:00");
  });
});
