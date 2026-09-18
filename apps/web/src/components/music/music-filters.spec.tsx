import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MusicArtistDto, MusicCategoryDto } from "@vedamatch/shared";
import {
  MusicFilters,
  countMusicFilters,
  musicFilterHref,
  type MusicFilterState,
} from "./music-filters";

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

const category = (
  slug: string,
  title: string,
  kind: MusicCategoryDto["kind"],
  trackCount: number,
) => ({ id: slug, slug, title, position: 0, kind, trackCount }) as MusicCategoryDto;

describe("musicFilterHref", () => {
  it("root и category сосуществуют в одной ссылке (VED-165)", () => {
    const href = musicFilterHref(
      { ...baseState, root: "traditional" },
      { category: "mantra" },
    );

    expect(href).toBe("/music?root=traditional&category=mantra");
  });

  it("пустые значения не попадают в адрес", () => {
    expect(musicFilterHref(baseState, {})).toBe("/music");
  });

  it("смена фильтра сбрасывает курсор", () => {
    const href = musicFilterHref(
      { ...baseState, cursor: "t9" },
      { category: "kirtan" },
    );

    expect(href).toBe("/music?category=kirtan");
  });
});

describe("countMusicFilters", () => {
  // VED-165: root — главный выбор витрины (вкладки), а не пункт панели
  // «Фильтры», и в счётчик на её чипе не попадает.
  it("root не считается, category считается", () => {
    expect(countMusicFilters({ ...baseState, root: "modern" })).toBe(0);
    expect(countMusicFilters({ ...baseState, category: "bhajan" })).toBe(1);
  });

  it("суммирует все активные фильтры панели", () => {
    expect(
      countMusicFilters({
        ...baseState,
        category: "kirtan",
        artist: "gaura-das",
        duration: "short",
        live: "true",
        sort: "popular",
      }),
    ).toBe(5);
  });
});

describe("MusicFilters — секция «Стиль»", () => {
  const artists: MusicArtistDto[] = [];
  const categories = [
    category("traditional", "Традиционное", "root", 4),
    category("kirtan", "Киртан", "style", 12),
    category("bhajan", "Бхаджан", "style", 0),
    category("mantra", "Мантра", "style", 3),
  ];

  it("показывает только стилевые категории, корневая сюда не попадает", () => {
    render(
      <MusicFilters state={baseState} artists={artists} categories={categories} />,
    );

    expect(screen.queryByText("Традиционное")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Киртан/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Мантра/ })).toBeInTheDocument();
  });

  it("не прячет пустой стиль — показывает приглушённым с нулём (тестировщик просил не скрывать раздел)", () => {
    render(
      <MusicFilters state={baseState} artists={artists} categories={categories} />,
    );
    const empty = screen.getByRole("link", { name: /Бхаджан/ });
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent("0");
    expect(empty.className).toMatch(/opacity-50/);

    render(
      <MusicFilters
        state={{ ...baseState, category: "bhajan" }}
        artists={artists}
        categories={categories}
      />,
    );
    // Уже выбранный пустой стиль не приглушается — иначе способ его снять
    // выглядел бы неактивным.
    const selected = screen.getAllByRole("link", { name: /Бхаджан/ }).at(-1)!;
    expect(selected.className).not.toMatch(/opacity-50/);
  });

  it("раздел «Стиль» виден и без единого стилевого раздела в справочнике", () => {
    render(
      <MusicFilters
        state={baseState}
        artists={artists}
        categories={[category("traditional", "Традиционное", "root", 4)]}
      />,
    );
    expect(screen.getByText("Стиль")).toBeInTheDocument();
    expect(screen.getByText("Пока нет ни одного стиля.")).toBeInTheDocument();
  });

  it("ссылка стиля сохраняет root — пересечение, а не замена", () => {
    render(
      <MusicFilters
        state={{ ...baseState, root: "traditional" }}
        artists={artists}
        categories={categories}
      />,
    );

    expect(screen.getByRole("link", { name: /Мантра/ })).toHaveAttribute(
      "href",
      "/music?root=traditional&category=mantra",
    );
  });

  it("«Снять фильтры» очищает и стиль", () => {
    render(
      <MusicFilters
        state={{ ...baseState, category: "kirtan" }}
        artists={artists}
        categories={categories}
      />,
    );

    expect(screen.getByRole("link", { name: "Снять фильтры" })).toHaveAttribute(
      "href",
      "/music",
    );
  });
});
