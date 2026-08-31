import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryCategoryTreeNode } from "@vedamatch/shared";
import { AddEntryForm } from "./add-entry-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const tree: LibraryCategoryTreeNode[] = [
  {
    id: "root-1",
    parentId: null,
    slug: "philosophy",
    titleRu: "Философия и писания",
    titleEn: "Philosophy",
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    depth: 0,
    entriesCount: 0,
    subtreeEntriesCount: 2,
    childrenCount: 1,
    createdAt: "2026-07-29T10:00:00.000Z",
    canEdit: false,
    canMove: false,
    canDelete: false,
    children: [
      {
        id: "category-1",
        parentId: "root-1",
        slug: "gita",
        titleRu: "Гита",
        titleEn: null,
        descriptionRu: null,
        descriptionEn: null,
        iconKey: null,
        position: 0,
        depth: 1,
        entriesCount: 2,
        subtreeEntriesCount: 2,
        childrenCount: 0,
        createdAt: "2026-07-29T10:00:00.000Z",
        canEdit: false,
        canMove: false,
        canDelete: false,
        children: [],
      },
    ],
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

    render(<AddEntryForm locale="ru" tree={tree} />);

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

  it("names the real reason behind a 400 instead of blaming the url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "description_too_long" }),
      }),
    );

    render(<AddEntryForm locale="ru" tree={tree} />);

    await userEvent.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://www.youtube.com/watch?v=OXDrvBwIHLg",
    );
    await userEvent.type(screen.getByLabelText("Заголовок по-русски"), "Видео");
    await userEvent.click(screen.getByLabelText("Гита"));
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));

    await waitFor(() => {
      expect(screen.getByText("Описание длиннее 1000 символов")).toBeDefined();
    });
  });

  it("creates a category inline without losing the entered link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: "category-2",
            sectionId: "section-1",
            sectionSlug: "philosophy",
            slug: "kirtan",
            titleRu: "Киртан",
            titleEn: null,
            descriptionRu: null,
            descriptionEn: null,
            entriesCount: 0,
            createdAt: "2026-07-29T10:00:00.000Z",
          }),
      }),
    );

    render(
      <AddEntryForm
        locale="ru"
        tree={tree}
      />,
    );

    await userEvent.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/a",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "+ Новая категория" }),
    );
    await userEvent.type(
      screen.getByLabelText("Название по-русски"),
      "Киртан",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Создать категорию" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Категория создана и выбрана")).toBeDefined();
    });
    expect((screen.getByLabelText("Киртан") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      (screen.getByLabelText("Адрес ссылки") as HTMLInputElement).value,
    ).toBe("https://example.com/a");
  });

  it("blocks submit until a title and a category are filled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddEntryForm locale="ru" tree={tree} />);

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
