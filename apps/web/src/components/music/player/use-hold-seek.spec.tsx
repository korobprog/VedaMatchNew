import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_THRESHOLD_MS, HOLD_TICK_MS } from "./hold-seek";
import { useHoldSeek } from "./use-hold-seek";

function Probe({
  seekBy,
  onTap,
  disabled = false,
}: {
  seekBy: (seconds: number) => void;
  onTap: () => void;
  disabled?: boolean;
}) {
  const hold = useHoldSeek({ direction: 1, seekBy, onTap, disabled });
  return (
    <button type="button" {...hold.props}>
      {hold.seeking ? "мотаю" : "дальше"}
    </button>
  );
}

/** Нажать и отпустить так, как это делает браузер: pointerup, потом click. */
function press(button: HTMLElement, holdMs: number) {
  fireEvent.pointerDown(button, { button: 0 });
  vi.advanceTimersByTime(holdMs);
  fireEvent.pointerUp(button);
  fireEvent.click(button);
}

describe("useHoldSeek", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("короткое нажатие переключает запись и не трогает звук", () => {
    const seekBy = vi.fn();
    const onTap = vi.fn();
    render(<Probe seekBy={seekBy} onTap={onTap} />);

    press(screen.getByRole("button"), 100);

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(seekBy).not.toHaveBeenCalled();
  });

  it("удержание мотает вперёд и не переключает запись при отпускании", () => {
    const seekBy = vi.fn();
    const onTap = vi.fn();
    render(<Probe seekBy={seekBy} onTap={onTap} />);

    press(screen.getByRole("button"), HOLD_THRESHOLD_MS + HOLD_TICK_MS * 2);

    expect(seekBy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(seekBy.mock.calls.every(([seconds]) => seconds > 0)).toBe(true);
    expect(onTap).not.toHaveBeenCalled();
  });

  it("шаг разгоняется, а не стоит на месте", () => {
    const seekBy = vi.fn();
    render(<Probe seekBy={seekBy} onTap={vi.fn()} />);

    press(screen.getByRole("button"), HOLD_THRESHOLD_MS + HOLD_TICK_MS * 3);

    const steps = seekBy.mock.calls.map(([seconds]) => seconds as number);
    expect(steps[steps.length - 1]).toBeGreaterThan(steps[0]);
  });

  it("отпускание останавливает перемотку", () => {
    const seekBy = vi.fn();
    render(<Probe seekBy={seekBy} onTap={vi.fn()} />);

    press(screen.getByRole("button"), HOLD_THRESHOLD_MS + HOLD_TICK_MS);
    const after = seekBy.mock.calls.length;
    vi.advanceTimersByTime(HOLD_TICK_MS * 10);

    expect(seekBy).toHaveBeenCalledTimes(after);
  });

  it("уход пальца с кнопки тоже останавливает — иначе звук уезжает молча", () => {
    const seekBy = vi.fn();
    render(<Probe seekBy={seekBy} onTap={vi.fn()} />);
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button, { button: 0 });
    vi.advanceTimersByTime(HOLD_THRESHOLD_MS);
    const after = seekBy.mock.calls.length;
    fireEvent.pointerLeave(button);
    vi.advanceTimersByTime(HOLD_TICK_MS * 5);

    expect(seekBy).toHaveBeenCalledTimes(after);
  });

  it("без соседней записи переход молчит, а перемотка работает", () => {
    const seekBy = vi.fn();
    const onTap = vi.fn();
    render(<Probe seekBy={seekBy} onTap={onTap} disabled />);
    const button = screen.getByRole("button");

    press(button, 100);
    expect(onTap).not.toHaveBeenCalled();

    press(button, HOLD_THRESHOLD_MS + HOLD_TICK_MS);
    expect(seekBy).toHaveBeenCalled();
  });

  it("клавиатура переключает запись: там нет событий указателя", () => {
    const onTap = vi.fn();
    render(<Probe seekBy={vi.fn()} onTap={onTap} />);

    fireEvent.click(screen.getByRole("button"));

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("правая кнопка мыши жестом не считается", () => {
    const seekBy = vi.fn();
    render(<Probe seekBy={seekBy} onTap={vi.fn()} />);

    fireEvent.pointerDown(screen.getByRole("button"), { button: 2 });
    vi.advanceTimersByTime(HOLD_THRESHOLD_MS + HOLD_TICK_MS * 3);

    expect(seekBy).not.toHaveBeenCalled();
  });
});
