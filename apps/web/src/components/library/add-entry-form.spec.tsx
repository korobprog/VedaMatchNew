import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryCategoryDto } from "@vedamatch/shared";
import { AddEntryForm } from "./add-entry-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const categories: LibraryCategoryDto[] = [
  {
    id: "category-1",
    sectionId: "section-1",
    sectionSlug: "philosophy",
    slug: "gita",
    titleRu: "Гита",
    titleEn: null,
    descriptionRu: null,
    descriptionEn: null,
    entriesCount: 2,
    createdAt: "2026-07-29T10:00:00.000Z",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AddEntryForm", () => {
  it("shows a friendly duplicate notice with a link to the existing entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            code: "entry_already_exists",
            entry: { id: "existing-1" },
          }),
      }),
    );

    render(<AddEntryForm locale="ru" categories={categories} />);

    await userEvent.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/a",
    );
    await userEvent.type(screen.getByLabelText("Заголовок по-русски"), "Статья");
    await userEvent.click(screen.getByLabelText("Гита"));
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));

    await waitFor(() => {
      expect(
        screen.getByText("Такая ссылка уже есть в библиотеке"),
      ).toBeDefined();
    });
    expect(
      screen
        .getByRole("link", { name: "Открыть существующую запись" })
        .getAttribute("href"),
    ).toBe("/library/entry/existing-1");
  });

  it("blocks submit until a title and a category are filled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddEntryForm locale="ru" categories={categories} />);

    await userEvent.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/a",
    );
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));

    expect(
      screen.getByText("Заполните заголовок хотя бы на одном языке"),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
