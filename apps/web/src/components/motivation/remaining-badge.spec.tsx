import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemainingBadge } from "./remaining-badge";

describe("RemainingBadge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("при перелистывании показывает остаток на секунду и гасит", () => {
    const { rerender } = render(<RemainingBadge total={10} index={0} />);
    const badge = screen.getByTestId("remaining-badge");
    // На открытии ленты не мигает — только при перелистывании.
    expect(badge).toHaveAttribute("data-visible", "false");

    rerender(<RemainingBadge total={10} index={1} />);
    expect(badge).toHaveTextContent("8");
    expect(badge).toHaveAttribute("data-visible", "true");
    expect(badge).toHaveClass("opacity-100", "motion-reduce:transition-none");

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(badge).toHaveAttribute("data-visible", "true");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(badge).toHaveAttribute("data-visible", "false");
    expect(badge).toHaveClass("opacity-0");
  });

  it("не объявляется скринридеру", () => {
    render(<RemainingBadge total={3} index={0} />);
    const badge = screen.getByTestId("remaining-badge");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge).not.toHaveAttribute("aria-live");
  });

  it("без числа от сервера ничего не рисует", () => {
    render(<RemainingBadge total={undefined} index={2} />);
    expect(screen.queryByTestId("remaining-badge")).not.toBeInTheDocument();
  });

  it("на служебном слайде гаснет", () => {
    const { rerender } = render(<RemainingBadge total={5} index={0} />);
    rerender(<RemainingBadge total={5} index={1} hidden />);
    expect(screen.getByTestId("remaining-badge")).toHaveAttribute(
      "data-visible",
      "false",
    );
  });
});
