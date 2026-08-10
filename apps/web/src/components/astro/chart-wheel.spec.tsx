import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GrahaPosition, VedicChart } from "@vedamatch/shared";
import { ChartWheel } from "./chart-wheel";

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
      graha({ graha: "sun", rashi: 1 }),
      graha({ graha: "saturn", rashi: 8, retrograde: true }),
      graha({ graha: "ketu", rashi: 6, retrograde: true }),
    ],
    moonNakshatra: 15,
    dasha: null,
    fingerprint: "test",
    engineVersion: "test",
    ...overrides,
  }) as VedicChart;

describe("ChartWheel", () => {
  it("рисует все двенадцать знаков, включая пустые", () => {
    const { container } = render(<ChartWheel chart={chart()} />);
    expect(container.querySelectorAll("rect")).toHaveLength(12);
  });

  it("подписывает знаки, а не дома: в южноиндийском стиле знаки закреплены", () => {
    render(<ChartWheel chart={chart()} />);
    expect(screen.getByText("Меша")).toBeInTheDocument();
    expect(screen.getByText("Вришчика")).toBeInTheDocument();
  });

  it("ставит грах в их знаки сокращениями", () => {
    render(<ChartWheel chart={chart()} />);
    expect(screen.getByText(/Су/)).toBeInTheDocument();
    expect(screen.getByText(/Ша/)).toBeInTheDocument();
    expect(screen.getByText(/Ке/)).toBeInTheDocument();
  });

  it("помечает ретроградные грахи", () => {
    const { container } = render(<ChartWheel chart={chart()} />);
    expect(container.textContent).toContain("R");
  });

  it("отмечает лагну диагональю в её клетке", () => {
    const { container } = render(<ChartWheel chart={chart()} />);
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });

  it("без лагны диагональ не рисуется и номера домов не выводятся", () => {
    const { container } = render(
      <ChartWheel chart={chart({ lagna: null, timeAccuracy: "unknown" })} />,
    );
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it("подписывает аянамшу — по ней карту сверяют с другой программой", () => {
    render(<ChartWheel chart={chart()} />);
    expect(screen.getByText(/23°40′/)).toBeInTheDocument();
  });

  it("масштабируется через viewBox, а не фиксированным размером", () => {
    const { container } = render(<ChartWheel chart={chart()} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 400");
    expect(svg.getAttribute("width")).toBeNull();
  });
});
