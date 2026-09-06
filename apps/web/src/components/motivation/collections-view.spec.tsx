import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  MotivationCategoryDto,
  MotivationPostDto,
} from "@vedamatch/shared";
import {
  MotivationCollectionGrid,
  MotivationCollections,
} from "./collections-view";

function category(
  over: Partial<MotivationCategoryDto> = {},
): MotivationCategoryDto {
  return {
    id: "r",
    slug: "vedy",
    title: "Веды",
    sortOrder: 0,
    isDefault: false,
    parentId: null,
    postCount: 12,
    ...over,
  };
}

function post(over: Partial<MotivationPostDto> = {}): MotivationPostDto {
  return {
    id: "p1",
    slug: "gita-2-13",
    imageUrl: "https://cdn/p1.webp",
    title: "Душа не умирает",
    storyText: "Душа не умирает",
    ...over,
  } as MotivationPostDto;
}

describe("MotivationCollections", () => {
  it("раскладывает подразделы под их разделом", () => {
    render(
      <MotivationCollections
        categories={[
          category(),
          category({ id: "c", slug: "gita", title: "Гита", parentId: "r", postCount: 5 }),
        ]}
      />,
    );

    const section = screen.getByRole("heading", { name: /Веды/ }).closest("section")!;
    expect(within(section).getByRole("link", { name: /Гита/ })).toHaveAttribute(
      "href",
      "/motivation/collections/gita",
    );
  });

  it("говорит, куда идти, когда разделов нет", () => {
    render(<MotivationCollections categories={[]} />);

    expect(screen.getByText(/Всё опубликованное — в ленте/)).toBeInTheDocument();
  });

  it("подраздел без своего раздела не всплывает наверх", () => {
    render(
      <MotivationCollections
        categories={[category({ id: "c", slug: "gita", title: "Гита", parentId: "r" })]}
      />,
    );

    // Родителя в списке нет, значит и показывать нечего: иначе подраздел
    // притворился бы разделом.
    expect(screen.getByText(/Разделов пока нет/)).toBeInTheDocument();
  });
});

describe("MotivationCollectionGrid", () => {
  it("ведёт в ленту, открытую на этой карточке", () => {
    render(<MotivationCollectionGrid posts={[post()]} />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/motivation?post=gita-2-13",
    );
  });

  it("не молчит на пустой папке", () => {
    render(<MotivationCollectionGrid posts={[]} />);

    expect(screen.getByText("В этом разделе пока пусто.")).toBeInTheDocument();
  });
});
