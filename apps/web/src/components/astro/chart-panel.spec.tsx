import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AstroTransitPositionsDto,
  GrahaPosition,
  VedicChart,
} from "@vedamatch/shared";
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

  const transits: AstroTransitPositionsDto = {
    at: "2026-09-28T12:00:00.000Z",
    ayanamsa: 24.2,
    grahas: [
      {
        graha: "jupiter",
        longitude: 95,
        degreeInRashi: 5,
        rashi: 4,
        nakshatra: 8,
        navamsaRashi: 2,
        retrograde: false,
      },
    ],
  };

  it("без транзитов с сервера переключателя транзитов нет", () => {
    render(<ChartPanel chart={chart()} />);
    expect(screen.queryByRole("button", { name: "Транзиты" })).toBeNull();
  });

  it("транзиты включаются поверх карты и получают легенду", () => {
    const { container } = render(
      <ChartPanel chart={chart()} transits={transits} />,
    );
    expect(container.querySelector("[data-transit]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Транзиты" }));

    expect(container.querySelectorAll("[data-transit]")).toHaveLength(1);
    expect(
      screen.getByText(/транзиты на 28 сентября 2026/),
    ).toBeInTheDocument();
    // Карка — четвёртый знак, от лагны Вришабхи это третий дом.
    expect(screen.getByText(/Карка 5°, дом 3/)).toBeInTheDocument();
  });

  it("в D9 транзит встаёт в свою навамшу", () => {
    render(<ChartPanel chart={chart()} transits={transits} />);
    fireEvent.click(screen.getByRole("button", { name: "Транзиты" }));
    fireEvent.click(screen.getByRole("button", { name: "D9" }));
    expect(svgLabel()).toMatch(/Навамша D9/);
    expect(screen.getByText(/Вришабха 15°/)).toBeInTheDocument();
  });

  it("от Луны северный ромб строится даже без времени рождения", () => {
    window.localStorage.setItem(CHART_STYLE_STORAGE_KEY, "north");
    render(
      <ChartPanel chart={chart({ lagna: null, timeAccuracy: "unknown" })} />,
    );
    expect(svgLabel()).toMatch(/южноиндийский/);
    fireEvent.click(screen.getByRole("button", { name: "От Луны" }));
    expect(svgLabel()).toMatch(/северноиндийский/);
    expect(screen.queryByText(/нужно время рождения/)).toBeNull();
  });
});
