import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MusicTrackHeroLayout } from "./track-hero-layout";

function renderHero() {
  render(
    <MusicTrackHeroLayout
      back={<a href="/music">Каталог</a>}
      cover={<span role="img" aria-label="Обложка" />}
      actions={<button type="button">Поделиться</button>}
      heading={<h1>Madhurastakam</h1>}
      rest={<button type="button">Слушать</button>}
    />,
  );
}

describe("MusicTrackHeroLayout (VED-605)", () => {
  it("на телефоне столбик кнопок начинается у «Каталога» и идёт до названия", () => {
    renderHero();

    const actions = screen.getByTestId("track-hero-actions");
    expect(actions).toHaveClass("col-start-2", "row-start-1", "row-span-3");
    expect(actions).toContainElement(
      screen.getByRole("button", { name: "Поделиться" }),
    );
  });

  it("название встаёт сразу под обложкой, слева от кнопок, без большого отступа", () => {
    renderHero();

    const cover = screen.getByTestId("track-hero-cover");
    const heading = screen.getByTestId("track-hero-heading");
    expect(cover).toHaveClass("col-start-1", "row-start-2");
    expect(heading).toHaveClass("col-start-1", "row-start-3", "mt-3");
    expect(heading.className).not.toMatch(/(^|\s)mt-(6|8|10)\b/);
    expect(heading).toContainElement(
      screen.getByRole("heading", { name: "Madhurastakam" }),
    );
  });

  it("остальное на телефоне — во всю ширину под столбиком", () => {
    renderHero();

    expect(screen.getByTestId("track-hero-rest")).toHaveClass(
      "col-span-2",
      "row-start-4",
    );
  });

  it("с sm — обложка, кнопки и текст справа, как раньше", () => {
    renderHero();

    expect(screen.getByTestId("track-hero")).toHaveClass(
      "sm:grid-cols-[18rem_auto_minmax(0,1fr)]",
    );
    expect(screen.getByTestId("track-hero-actions")).toHaveClass(
      "sm:row-start-2",
    );
    expect(screen.getByTestId("track-hero-heading")).toHaveClass(
      "sm:col-start-3",
      "sm:row-start-2",
    );
  });

  it("порядок в разметке: Каталог, обложка, кнопки, название, остальное", () => {
    renderHero();

    const order = [
      screen.getByRole("link", { name: "Каталог" }),
      screen.getByRole("img", { name: "Обложка" }),
      screen.getByRole("button", { name: "Поделиться" }),
      screen.getByRole("heading", { name: "Madhurastakam" }),
      screen.getByRole("button", { name: "Слушать" }),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
