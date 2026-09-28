import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryCategoryDto } from "@vedamatch/shared";
import { CategoryTitleEdit } from "./category-title-edit";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/http-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function category(canEdit: boolean): LibraryCategoryDto {
  return {
    id: "c1",
    parentId: "p1",
    slug: "ari-mardan",
    titleRu: "Ари Мардан Прабху",
    titleEn: null,
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    depth: 1,
    entriesCount: 2,
    subtreeEntriesCount: 2,
    childrenCount: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    canEdit,
    canMove: false,
    canDelete: false,
  };
}

describe("CategoryTitleEdit (VED-394)", () => {
  it("не рисуется у того, кто не может править рубрику", () => {
    const { container } = render(
      <CategoryTitleEdit locale="ru" category={category(false)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("открывает правку имени с фокусом в поле", () => {
    render(<CategoryTitleEdit locale="ru" category={category(true)} />);
    const button = screen.getByRole("button", {
      name: "Редактировать заголовок этой страницы",
    });
    expect(button).toHaveTextContent("Редактировать");
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    const field = screen.getByLabelText("Заголовок по-русски");
    expect(field).toHaveValue("Ари Мардан Прабху");
    expect(field).toHaveFocus();
  });

  it("Esc закрывает правку и возвращает фокус на кнопку", async () => {
    render(<CategoryTitleEdit locale="ru" category={category(true)} />);
    const button = screen.getByRole("button", {
      name: "Редактировать заголовок этой страницы",
    });
    fireEvent.click(button);

    fireEvent.keyDown(screen.getByLabelText("Заголовок по-русски"), {
      key: "Escape",
    });

    expect(screen.queryByLabelText("Заголовок по-русски")).toBeNull();
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("правит только заголовок страницы, не название рубрики", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...category(true),
        pageTitleRu: "Ари Мардан",
      }),
    });
    render(<CategoryTitleEdit locale="ru" category={category(true)} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Редактировать заголовок этой страницы",
      }),
    );
    expect(
      screen.getByText(/На плитке, в пути и на карточках останется/),
    ).toHaveTextContent("«Ари Мардан Прабху»");

    fireEvent.change(screen.getByLabelText("Заголовок по-русски"), {
      target: { value: "Ари Мардан" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/library\/categories\/c1$/);
    expect(JSON.parse(init.body as string)).toEqual({
      pageTitleRu: "Ари Мардан",
      pageTitleEn: null,
    });
  });

  it("открывается со своим заголовком, если он уже задан", () => {
    render(
      <CategoryTitleEdit
        locale="ru"
        category={{ ...category(true), pageTitleRu: "Ари Мардан" }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Редактировать заголовок этой страницы",
      }),
    );
    expect(screen.getByLabelText("Заголовок по-русски")).toHaveValue(
      "Ари Мардан",
    );
  });
});
