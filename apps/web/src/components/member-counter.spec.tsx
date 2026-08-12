import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberCounter } from "./member-counter";

describe("MemberCounter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("считает вверх до итогового числа и форматирует его по-русски", () => {
    render(<MemberCounter total={1234} />);

    act(() => {
      vi.advanceTimersByTime(1300);
    });

    // toLocaleString вставляет узкий неразрывный пробел (U+202F) как
    // разделитель разрядов; нормализатор testing-library схлопывает его
    // до обычного пробела при сравнении с DOM, но не трогает наш эталон —
    // нормализуем его так же, иначе визуально одинаковые строки не совпадут.
    const expected = (1234).toLocaleString("ru-RU").replace(/\s/g, " ");
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("при prefers-reduced-motion показывает итог сразу, без анимации", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    render(<MemberCounter total={500} />);

    expect(
      screen.getByText((500).toLocaleString("ru-RU")),
    ).toBeInTheDocument();
  });
});
