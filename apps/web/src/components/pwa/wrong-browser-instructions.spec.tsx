import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WrongBrowserInstructions } from "./wrong-browser-instructions";

const originalLocation = window.location;

function stubLocation(href: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href, origin: "https://vedamatch.ru" },
  });
}

describe("WrongBrowserInstructions", () => {
  beforeEach(() => {
    stubLocation("https://vedamatch.ru/union");
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.useRealTimers();
  });

  it("hands the current address to Chrome", async () => {
    render(
      <WrongBrowserInstructions
        browser="yandex-browser"
        platform="android"
        onClose={() => {}}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Открыть в Chrome" }),
    );

    expect(window.location.href).toBe(
      "intent://vedamatch.ru/union#Intent;scheme=https;package=com.android.chrome;end",
    );
  });

  it("admits Chrome is missing when the page is still here after the handoff", async () => {
    // Здесь нужны поддельные таймеры, а userEvent с ними ждёт настоящих
    // задержек и виснет, поэтому клик — простым событием.
    vi.useFakeTimers();
    render(
      <WrongBrowserInstructions
        browser="yandex-browser"
        platform="android"
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Открыть в Chrome" }));
    expect(screen.queryByText("Chrome не открылся")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(screen.getByText("Chrome не открылся")).toBeInTheDocument();
  });

  it("names the browser the user is actually in", () => {
    render(
      <WrongBrowserInstructions
        browser="yandex-browser"
        platform="android"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/Яндекс\.Браузер не создаёт/)).toBeInTheDocument();
  });

  it("explains that the Yandex app has no install at all, rather than blaming a shortcut", () => {
    render(
      <WrongBrowserInstructions
        browser="yandex-app"
        platform="android"
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByText(/встроенном окне — установить портал оттуда нельзя/),
    ).toBeInTheDocument();
  });

  it("offers copying the address on iOS instead of an Android intent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <WrongBrowserInstructions
        browser="yandex-browser"
        platform="ios"
        onClose={() => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Открыть в Chrome" }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Скопировать адрес" }),
    );

    expect(writeText).toHaveBeenCalledWith("https://vedamatch.ru");
    expect(
      await screen.findByRole("button", { name: "Адрес скопирован" }),
    ).toBeInTheDocument();
  });
});
