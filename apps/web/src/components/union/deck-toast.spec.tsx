import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { DeckToast } from "./deck-toast";
import { TOAST_MS } from "./deck-burst";

describe("DeckToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("announces the message without taking space in the flow", () => {
    const { container } = render(
      <DeckToast message="Взаимно! Чат открыт" celebrate onDone={() => {}} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Взаимно! Чат открыт");
    // Ради этого всё и делалось: накладка лежит поверх колоды и не двигает
    // страницу, а касания проходят сквозь неё к кнопкам решений.
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.className).toContain("absolute");
    expect(overlay.className).toContain("pointer-events-none");
  });

  it("hides itself after the timeout", () => {
    const onDone = vi.fn();
    render(<DeckToast message="Запрос отправлен" celebrate={false} onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(TOAST_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("starts no timer without a message", () => {
    const onDone = vi.fn();
    render(<DeckToast message={null} celebrate={false} onDone={onDone} />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => void vi.advanceTimersByTime(TOAST_MS * 2));
    expect(onDone).not.toHaveBeenCalled();
  });
});
