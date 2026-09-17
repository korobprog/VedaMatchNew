import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TelegramLoginButton } from "./telegram-login-button";

function widgetScript(): HTMLScriptElement {
  const container = screen.getByTestId("telegram-login-widget");
  const script = container.querySelector("script");
  if (!script) throw new Error("Скрипт виджета не найден");
  return script;
}

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("TelegramLoginButton", () => {
  it("вставляет официальный скрипт виджета с ботом по умолчанию", () => {
    render(<TelegramLoginButton />);
    const script = widgetScript();

    expect(script.src).toBe("https://telegram.org/js/telegram-widget.js?22");
    expect(script).toHaveAttribute("data-telegram-login", "vedamatch_bot");
    expect(script).toHaveAttribute("data-request-access", "write");
    expect(script).toHaveAttribute("data-size", "large");
  });

  it("data-auth-url ведёт на /auth/telegram/callback", () => {
    render(<TelegramLoginButton />);
    const script = widgetScript();

    expect(script.getAttribute("data-auth-url")).toMatch(
      /\/auth\/telegram\/callback$/,
    );
  });

  it("returnTo уходит в data-auth-url, а корень — нет", () => {
    const { rerender } = render(<TelegramLoginButton returnTo="/union/matches" />);
    expect(widgetScript().getAttribute("data-auth-url")).toContain(
      "returnTo=%2Funion%2Fmatches",
    );

    rerender(<TelegramLoginButton returnTo="/" />);
    expect(widgetScript().getAttribute("data-auth-url")).not.toContain(
      "returnTo",
    );
  });

  it("тёмная тема портала передаётся виджету", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<TelegramLoginButton />);
    expect(widgetScript()).toHaveAttribute("data-color-scheme", "dark");
  });

  it("без выставленной тёмной темы — светлая схема по умолчанию", () => {
    render(<TelegramLoginButton />);
    expect(widgetScript()).toHaveAttribute("data-color-scheme", "light");
  });

  it("резервирует высоту контейнера, чтобы загрузка iframe не сдвигала соседей", () => {
    render(<TelegramLoginButton />);
    const container = screen.getByTestId("telegram-login-widget");
    expect(container.className).toMatch(/min-h-11/);
  });
});
