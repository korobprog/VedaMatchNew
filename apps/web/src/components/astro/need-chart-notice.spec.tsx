import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEED_CHART_NOTICE_MS, NeedChartNotice } from "./need-chart-notice";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/astro",
}));

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockReset();
});
afterEach(() => vi.useRealTimers());

/* VED-659: без натальной карты «Транзиты» — надпись на 2 секунды. */
describe("NeedChartNotice", () => {
  it("показывает надпись и через две секунды убирает её и параметр", () => {
    render(<NeedChartNotice />);
    expect(
      screen.getByText("Сначала составьте свою натальную карту"),
    ).toHaveClass("opacity-100");

    act(() => {
      vi.advanceTimersByTime(NEED_CHART_NOTICE_MS);
    });

    expect(
      screen.getByText("Сначала составьте свою натальную карту"),
    ).toHaveClass("opacity-0");
    expect(replace).toHaveBeenCalledWith("/astro", { scroll: false });
  });
});
