import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GrahaPosition, VedicChart } from "@vedamatch/shared";
import { ChartPanel } from "./chart-panel";
import { CHART_STYLE_STORAGE_KEY } from "./chart-style";

const graha = (overrides: Partial<GrahaPosition>): GrahaPosition => ({
  graha: "sun",
  longitude: 27.17,
  degreeInRashi: 27.17,
  rashi: 1,
  nakshatra: 3,
  pada: 1,
  navamsaRashi: 9,
  bhava: 12,
  retrograde: false,
  combust: false,
  ...overrides,
});

const chart = (overrides: Partial<VedicChart> = {}): VedicChart =>
  ({
    bornAtUtc: "1987-05-12T02:20:00.000Z",
    timeAccuracy: "exact",
    ayanamsa: 23.669,
    lagna: { longitude: 46.19, rashi: 2, nakshatra: 4, pada: 1 },
    grahas: [
      graha({ graha: "sun" }),
      graha({ graha: "moon", rashi: 7, bhava: 6 }),
    ],
    moonNakshatra: 15,
    dasha: null,
    fingerprint: "test",
    engineVersion: "test",
    ...overrides,
  }) as VedicChart;

const svgLabel = () => screen.getByRole("img").getAttribute("aria-label") ?? "";

describe("ChartPanel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("по умолчанию рисует одну карту — южную", () => {
    render(<ChartPanel chart={chart()} />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(svgLabel()).toMatch(/южноиндийский/);
    expect(screen.getByRole("button", { name: "Южный" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("переключается на северную и запоминает выбор", () => {
    render(<ChartPanel chart={chart()} />);
    fireEvent.click(screen.getByRole("button", { name: "Северный" }));
    expect(svgLabel()).toMatch(/северноиндийский/);
    expect(window.localStorage.getItem(CHART_STYLE_STORAGE_KEY)).toBe("north");
  });

  it("поднимает сохранённый выбор при следующем открытии", () => {
    window.localStorage.setItem(CHART_STYLE_STORAGE_KEY, "north");
    render(<ChartPanel chart={chart()} />);
    expect(svgLabel()).toMatch(/северноиндийский/);
  });

  it("без лагны показывает южную и объясняет почему", () => {
    window.localStorage.setItem(CHART_STYLE_STORAGE_KEY, "north");
    render(
      <ChartPanel chart={chart({ lagna: null, timeAccuracy: "unknown" })} />,
    );
    expect(svgLabel()).toMatch(/южноиндийский/);
    expect(screen.getByText(/нужно время рождения/)).toBeInTheDocument();
    // Выбор человека не перезаписан: появится лагна — появится и ромб.
    expect(window.localStorage.getItem(CHART_STYLE_STORAGE_KEY)).toBe("north");
  });
});
