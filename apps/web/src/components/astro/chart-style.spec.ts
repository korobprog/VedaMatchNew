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

  it("на всём неожиданном — северный стиль по умолчанию (VED-658)", () => {
    expect(DEFAULT_CHART_STYLE).toBe("north");
    expect(parseChartStyle(null)).toBe("north");
    expect(parseChartStyle("")).toBe("north");
    expect(parseChartStyle("South")).toBe("north");
    expect(parseChartStyle('"south"')).toBe("north");
  });

  it("сохранённый выбор уважается в обе стороны", () => {
    expect(parseChartStyle("south")).toBe("south");
    expect(parseChartStyle("north")).toBe("north");
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
