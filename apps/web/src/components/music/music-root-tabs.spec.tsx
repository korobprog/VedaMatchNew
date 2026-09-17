import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MusicCategoryDto } from "@vedamatch/shared";
import { MusicRootTabs } from "./music-root-tabs";
import type { MusicFilterState } from "./music-filters";

const category = (
  slug: string,
  title: string,
  kind: MusicCategoryDto["kind"],
  trackCount: number,
) => ({ id: slug, slug, title, position: 0, kind, trackCount }) as MusicCategoryDto;

const baseState: MusicFilterState = {
  root: null,
  category: null,
  q: null,
  artist: null,
  duration: null,
  live: null,
  sort: null,
  cursor: null,
};

describe("MusicRootTabs", () => {
  const categories = [
    category("traditional", "Традиционное", "root", 0),
    category("modern", "Современное", "root", 3),
    category("kirtan", "Киртан", "style", 12),
  ];

  it("показывает только корневые категории, стиль сюда не попадает", () => {
    render(<MusicRootTabs categories={categories} state={baseState} />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Всё",
      "Традиционное",
      "Современное3",
    ]);
  });

  // Ключевое отличие от прежних чипов (VED-145): пустая корневая категория
  // не прячется, её всего две и это стабильная навигация, а не список тегов.
  it("не прячет корневую категорию с нулём записей", () => {
    render(<MusicRootTabs categories={categories} state={baseState} />);

    expect(
      screen.getByRole("link", { name: "Традиционное" }),
    ).toBeInTheDocument();
  });

  it("ссылка ведёт на ?root=<slug> и сохраняет остальные фильтры", () => {
    render(
      <MusicRootTabs
        categories={categories}
        state={{ ...baseState, category: "kirtan" }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Современное3" }),
    ).toHaveAttribute("href", "/music?root=modern&category=kirtan");
  });

  it("«Всё» снимает root, не трогая остальное", () => {
    render(
      <MusicRootTabs
        categories={categories}
        state={{ ...baseState, root: "modern", artist: "gaura-das" }}
      />,
    );

    expect(screen.getByRole("link", { name: "Всё" })).toHaveAttribute(
      "href",
      "/music?artist=gaura-das",
    );
  });

  it("активная вкладка помечена aria-current", () => {
    render(
      <MusicRootTabs
        categories={categories}
        state={{ ...baseState, root: "traditional" }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Традиционное" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Всё" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("без корневых категорий не рендерится вовсе", () => {
    const { container } = render(
      <MusicRootTabs
        categories={[category("kirtan", "Киртан", "style", 1)]}
        state={baseState}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
