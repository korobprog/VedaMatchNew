import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MotivationHomeButtons } from "./motivation-home-buttons";

describe("MotivationHomeButtons", () => {
  const buttons = {
    card: "/motivation?category=filosofiya-2&resume=1",
    source: { href: "/motivation?work=X", title: "Бхагавад-гита", custom: false },
    cards: {
      href: "/motivation?tab=cards&category=filosofiya-2",
      title: "Мудрость мира",
      custom: false,
    },
  };

  it("две ссылки с полными именами и над накладкой карточки", () => {
    render(<MotivationHomeButtons buttons={buttons} />);

    const source = screen.getByRole("link", { name: "Лента: Бхагавад-гита" });
    const cards = screen.getByRole("link", { name: "Открытки: Мудрость мира" });
    expect(source).toHaveAttribute("href", "/motivation?work=X");
    expect(cards).toHaveAttribute(
      "href",
      "/motivation?tab=cards&category=filosofiya-2",
    );
    // Без подъёма нажатие уходило бы в ссылку названия, растянутую на карточку.
    for (const link of [source, cards]) {
      // VED-432: клетка видимо меньше (36px), область нажатия — 44px за
      // счёт выступающего на 4px псевдоэлемента.
      expect(link).toHaveClass("relative", "z-10", "size-9", "before:-inset-1");
      expect(link).toHaveAttribute("title");
    }
  });

  it("без папки — одна кнопка", () => {
    render(<MotivationHomeButtons buttons={{ ...buttons, cards: null }} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
