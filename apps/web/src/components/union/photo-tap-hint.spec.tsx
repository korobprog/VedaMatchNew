import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PhotoTapHint } from "./photo-tap-hint";
import { photoHintKey } from "@/lib/union/photo-hint-seen";

describe("PhotoTapHint", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("учит жесту и уходит сама", () => {
    const { container } = render(<PhotoTapHint />);
    expect(screen.getByRole("status")).toHaveTextContent("Тапните по краю фото");

    // Подсказку не надо закрывать: достаточно сделать то, о чём она говорит,
    // поэтому касания она пропускает насквозь.
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.className).toContain("pointer-events-none");

    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.queryByRole("status")).toBeNull();
    expect(window.localStorage.getItem(photoHintKey)).toBe("1");
  });

  it("больше не показывается тому, кто её видел", () => {
    window.localStorage.setItem(photoHintKey, "1");
    render(<PhotoTapHint />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
