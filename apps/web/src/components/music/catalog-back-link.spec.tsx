import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MusicCatalogBackLink } from "./catalog-back-link";

describe("MusicCatalogBackLink (VED-588)", () => {
  it("ведёт в каталог Медиатеки", () => {
    render(<MusicCatalogBackLink />);

    expect(screen.getByRole("link", { name: /Каталог/ })).toHaveAttribute(
      "href",
      "/music",
    );
  });

  it("стоит в левом поле, а не в правом углу", () => {
    render(<MusicCatalogBackLink />);

    const link = screen.getByRole("link", { name: /Каталог/ });
    expect(link).toHaveClass("absolute", "left-2", "md:left-4");
    expect(link.className).not.toMatch(/\bright-/);
  });

  it("стрелка декоративная — имя ссылки просто «Каталог»", () => {
    render(<MusicCatalogBackLink />);

    expect(screen.getByRole("link", { name: "Каталог" })).toBeInTheDocument();
  });
});
