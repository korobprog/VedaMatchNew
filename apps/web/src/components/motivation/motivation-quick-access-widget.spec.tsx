import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MotivationQuickAccessWidget } from "./motivation-quick-access-widget";

describe("MotivationQuickAccessWidget", () => {
  it("без цитаты ничего не рисует", () => {
    const { container } = render(
      <MotivationQuickAccessWidget quote={null} freshMore={3} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("цитата ведёт на свой пост, подпись и «ещё новых» на месте", () => {
    render(
      <MotivationQuickAccessWidget
        quote={{
          slug: "gita-4-18",
          text: "Тот, кто видит бездействие в действии…",
          attribution: "Бхагавад-гита 4.18",
        }}
        freshMore={2}
      />,
    );

    const link = screen.getByRole("link", { name: /бездействие/ });
    expect(link).toHaveAttribute("href", "/motivation?post=gita-4-18");
    expect(screen.getByText("— Бхагавад-гита 4.18")).toBeInTheDocument();
    expect(screen.getByText(/и ещё 2 новых с прошлого визита/)).toBeInTheDocument();
  });

  it("без свежих строки про новые нет", () => {
    render(
      <MotivationQuickAccessWidget
        quote={{ slug: "a", text: "Мир вам", attribution: null }}
        freshMore={0}
      />,
    );
    expect(screen.queryByText(/с прошлого визита/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^—/)).not.toBeInTheDocument();
  });
});
