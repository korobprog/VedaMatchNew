import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHART_STYLE,
  effectiveChartStyle,
  parseChartStyle,
} from "./chart-style";

describe("parseChartStyle", () => {
  it("восстанавливает сохранённый выбор", () => {
    expect(parseChartStyle("north")).toBe("north");
    expect(parseChartStyle("south")).toBe("south");
  });

  it("на всём неожиданном возвращает южный стиль по умолчанию", () => {
    expect(DEFAULT_CHART_STYLE).toBe("south");
    expect(parseChartStyle(null)).toBe("south");
    expect(parseChartStyle("")).toBe("south");
    expect(parseChartStyle("North")).toBe("south");
    expect(parseChartStyle('"north"')).toBe("south");
  });
});

describe("effectiveChartStyle", () => {
  it("рисует выбранный стиль, когда есть первый дом", () => {
    expect(effectiveChartStyle("north", true)).toBe("north");
    expect(effectiveChartStyle("south", true)).toBe("south");
  });

  it("без первого дома северный уступает южному", () => {
    expect(effectiveChartStyle("north", false)).toBe("south");
  });

  it("южный от первого дома не зависит", () => {
    expect(effectiveChartStyle("south", false)).toBe("south");
  });
});
