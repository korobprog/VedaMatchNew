import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LibraryCategoryDto } from "@vedamatch/shared";
import { EntryFilters } from "./entry-filters";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

const categories: LibraryCategoryDto[] = [
  {
    id: "c1",
    sectionId: "s1",
    sectionSlug: "philosophy",
    slug: "isha-priya-prabhu",
    titleRu: "Иша-прия Прабху",
    titleEn: "Isha-priya Prabhu",
    descriptionRu: null,
    descriptionEn: null,
    entriesCount: 1,
    createdAt: "2026-08-23T00:00:00.000Z",
    canEdit: false,
  },
  {
    id: "c2",
    sectionId: "s1",
    sectionSlug: "philosophy",
    slug: "bhakti-vikasa-swami",
    titleRu: "Е. С. Бхакти Викаша Свами",
    titleEn: "H.G. Bhakti Vikasa Swami",
    descriptionRu: null,
    descriptionEn: null,
    entriesCount: 1,
    createdAt: "2026-08-23T00:00:00.000Z",
    canEdit: false,
  },
];

describe("EntryFilters — категория на странице одной категории", () => {
  it("без categoryBasePath фильтрует через query, как раньше", async () => {
    const user = userEvent.setup();
    render(<EntryFilters locale="ru" categories={categories} />);

    await user.selectOptions(
      screen.getByLabelText(/категория/i),
      "bhakti-vikasa-swami",
    );

    expect(push).toHaveBeenCalledWith("?categorySlug=bhakti-vikasa-swami");
  });

  it("с categoryBasePath переходит на страницу другой категории, а не молча теряет выбор", async () => {
    const user = userEvent.setup();
    render(
      <EntryFilters
        locale="ru"
        categories={categories}
        categoryBasePath="/library/philosophy"
        currentCategorySlug="isha-priya-prabhu"
      />,
    );

    // На странице категории query.categorySlug роут всё равно переопределит
    // фиксированным значением — единственный работающий способ сменить
    // категорию отсюда это перейти на другой URL.
    await user.selectOptions(
      screen.getByLabelText(/категория/i),
      "bhakti-vikasa-swami",
    );

    expect(push).toHaveBeenCalledWith("/library/philosophy/bhakti-vikasa-swami");
  });

  it("выбор «Все» с categoryBasePath уводит на страницу раздела без категории", async () => {
    const user = userEvent.setup();
    render(
      <EntryFilters
        locale="ru"
        categories={categories}
        categoryBasePath="/library/philosophy"
        currentCategorySlug="isha-priya-prabhu"
      />,
    );

    await user.selectOptions(screen.getByLabelText(/категория/i), "");

    expect(push).toHaveBeenCalledWith("/library/philosophy");
  });

  it("селект показывает текущую категорию, а не «Все»", () => {
    render(
      <EntryFilters
        locale="ru"
        categories={categories}
        categoryBasePath="/library/philosophy"
        currentCategorySlug="isha-priya-prabhu"
      />,
    );

    expect(screen.getByLabelText(/категория/i)).toHaveValue(
      "isha-priya-prabhu",
    );
  });
});
