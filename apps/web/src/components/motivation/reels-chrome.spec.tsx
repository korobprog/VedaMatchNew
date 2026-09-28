import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReelsChrome } from "./reels-chrome";
import { FEED_RESTART_EVENT } from "./feed-position";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  push.mockReset();
  window.history.pushState({}, "", "/");
});

describe("ReelsChrome", () => {
  // VED-252: кружок-подложка убран, но кнопки остаются доступны по имени и
  // с невидимой областью нажатия ≥ 40px (`size-10`), несмотря на то что
  // видимая иконка стала мельче.
  it("кнопки «←» и меню разделов доступны по имени, без круглой подложки", () => {
    render(<ReelsChrome isAdmin={false} />);

    const back = screen.getByRole("link", { name: "Назад на портал" });
    expect(back).toHaveAttribute("href", "/");
    expect(back.className).not.toMatch(/rounded-full|bg-black/);
    expect(back.className).toMatch(/size-10/);

    const menu = screen.getByRole("button", { name: "Разделы Вдохновения" });
    expect(menu.className).not.toMatch(/rounded-full|bg-black/);
    expect(menu.className).toMatch(/size-10/);
  });

  // VED-599: ← и ☰ придвинуты к краям — поле нажатия вплотную к краю.
  it("кнопки «←» и меню стоят вплотную к краям", () => {
    render(<ReelsChrome isAdmin={false} />);

    expect(screen.getByRole("link", { name: "Назад на портал" })).toHaveClass("left-0");
    expect(screen.getByRole("button", { name: "Разделы Вдохновения" })).toHaveClass(
      "right-0",
    );
  });

  it("открывает разделы по нажатию на кнопку меню", async () => {
    const user = userEvent.setup();
    render(<ReelsChrome isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: "Разделы Вдохновения" }));

    expect(screen.getByRole("button", { name: "Закрыть разделы" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вперемешку" })).toBeInTheDocument();
  });

  // VED-639: в меню «К началу ленты» — первой клавишей, другим цветом, а
  // дубликата «Категорий» (он есть в верхнем ряду) нет.
  it("меню начинается с «К началу ленты», без дубликата «Категорий»", async () => {
    const user = userEvent.setup();
    render(<ReelsChrome isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: "Разделы Вдохновения" }));

    const menu = screen.getByRole("navigation", { name: "Разделы вдохновения" });
    const restart = within(menu).getByRole("button", { name: "К началу ленты" });
    expect(menu.firstElementChild).toBe(restart);
    expect(restart).toHaveClass("btn-mint");
    expect(within(menu).queryByRole("link", { name: "Категории" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Лента" })).toHaveAttribute("aria-current", "page");
  });

  it("«К началу ленты» прокручивает открытую ленту, а не уводит со страницы", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/motivation?tab=cards&category=guru");
    const onRestart = vi.fn();
    window.addEventListener(FEED_RESTART_EVENT, onRestart);
    try {
      render(<ReelsChrome isAdmin={false} tab="cards" />);
      await user.click(screen.getByRole("button", { name: "Разделы Вдохновения" }));
      await user.click(screen.getByRole("button", { name: "К началу ленты" }));

      expect(onRestart).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
      // Меню закрывается: ленту под ним должно быть видно.
      expect(screen.queryByRole("button", { name: "К началу ленты" })).not.toBeInTheDocument();
    } finally {
      window.removeEventListener(FEED_RESTART_EVENT, onRestart);
    }
  });

  it("лента с места остановки уходит на адрес своего начала", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/motivation?tab=cards&category=guru&resume=1");
    const onRestart = vi.fn();
    window.addEventListener(FEED_RESTART_EVENT, onRestart);
    try {
      render(<ReelsChrome isAdmin={false} tab="cards" />);
      await user.click(screen.getByRole("button", { name: "Разделы Вдохновения" }));
      await user.click(screen.getByRole("button", { name: "К началу ленты" }));

      expect(push).toHaveBeenCalledWith("/motivation?tab=cards&category=guru");
      expect(onRestart).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(FEED_RESTART_EVENT, onRestart);
    }
  });
});
