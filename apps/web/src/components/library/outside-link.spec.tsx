import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutsideLink } from "./outside-link";

const originalLocation = window.location;

/**
 * Настоящий переход jsdom не умеет, а нам и нужен только сам факт: куда
 * ссылка попыталась уйти и в каком порядке.
 */
function stubLocation() {
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "https://vedamatch.ru/library", assign },
  });
  return assign;
}

function hidePage() {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("OutsideLink", () => {
  let assign: ReturnType<typeof stubLocation>;

  beforeEach(() => {
    assign = stubLocation();
    vi.useFakeTimers();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    vi.useRealTimers();
  });

  it("телеграм-ссылку сначала отдаёт приложению", () => {
    render(<OutsideLink href="https://t.me/aindra_kirtan/142">Канал</OutsideLink>);

    const click = fireEvent.click(screen.getByRole("link", { name: "Канал" }));

    expect(assign).toHaveBeenCalledWith("tg://resolve?domain=aindra_kirtan&post=142");
    // Обычный переход по href отменён — иначе рядом откроется белая вкладка.
    expect(click).toBe(false);
  });

  it("приложения нет — через паузу уходит на сайт", () => {
    render(<OutsideLink href="https://t.me/aindra_kirtan">Канал</OutsideLink>);

    fireEvent.click(screen.getByRole("link", { name: "Канал" }));
    vi.advanceTimersByTime(2000);

    expect(assign).toHaveBeenLastCalledWith("https://t.me/aindra_kirtan");
  });

  it("приложение открылось — второго перехода не будет", () => {
    render(<OutsideLink href="https://t.me/aindra_kirtan">Канал</OutsideLink>);

    fireEvent.click(screen.getByRole("link", { name: "Канал" }));
    hidePage();
    vi.advanceTimersByTime(2000);

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("tg://resolve?domain=aindra_kirtan");
  });

  it("остальные адреса открывает браузер сам", () => {
    render(<OutsideLink href="https://youtu.be/abcdefg">Видео</OutsideLink>);

    const click = fireEvent.click(screen.getByRole("link", { name: "Видео" }));

    expect(assign).not.toHaveBeenCalled();
    expect(click).toBe(true);
  });

  it("ссылка остаётся ссылкой: адрес и цель на месте", () => {
    render(<OutsideLink href="https://t.me/aindra_kirtan">Канал</OutsideLink>);

    const link = screen.getByRole("link", { name: "Канал" });
    expect(link).toHaveAttribute("href", "https://t.me/aindra_kirtan");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
