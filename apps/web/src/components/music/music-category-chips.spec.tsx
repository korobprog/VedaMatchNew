import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MusicCategoryDto } from "@vedamatch/shared";
import { MusicCategoryChips } from "./music-category-chips";

const category = (slug: string, title: string, trackCount: number) =>
  ({ id: slug, slug, title, trackCount }) as MusicCategoryDto;

describe("MusicCategoryChips", () => {
  const categories = [
    category("kirtan", "Киртан", 1),
    category("bhajan", "Бхаджан", 24),
    category("mantra", "Мантра", 3),
    category("lecture", "Лекции", 0),
  ];

  it("показывает непустые разделы ссылками на фильтр", () => {
    render(<MusicCategoryChips categories={categories} active={null} />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Всё", "Киртан1", "Бхаджан24", "Мантра3"]);
    expect(screen.getByRole("link", { name: /Мантра/ })).toHaveAttribute("href", "/music?category=mantra");
  });

  // VED-145: при полях 14 и промежутках 8 четвёртый чип обрезался на 375.
  it("держит чипы узкими, чтобы ряд влезал на экран телефона", () => {
    render(<MusicCategoryChips categories={categories} active={null} />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("px-2.5", "gap-1.5");
    }
    expect(screen.getByRole("list")).toHaveClass("gap-1.5");
  });
});
