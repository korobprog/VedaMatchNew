import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AstroQuickAccessWidget } from "./astro-quick-access-widget";

describe("AstroQuickAccessWidget", () => {
  it("без строки Луны ничего не рисует", () => {
    const { container } = render(
      <AstroQuickAccessWidget moonLine={null} dashaLine="Даша Гуру / Шани" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("показывает Луну и дашу и ведёт на персональный день", () => {
    render(
      <AstroQuickAccessWidget
        moonLine="Луна в Рохини (Вришабха), 4-й дом"
        dashaLine="Даша Гуру / Шани"
      />,
    );
    expect(screen.getByRole("link", { name: /Луна в Рохини/ })).toHaveAttribute(
      "href",
      "/astro#today",
    );
    expect(screen.getByText("Даша Гуру / Шани")).toBeInTheDocument();
  });
});
