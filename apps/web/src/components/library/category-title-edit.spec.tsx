import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryCategoryDto } from "@vedamatch/shared";
import { CategoryTitleEdit } from "./category-title-edit";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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
      name: "Редактировать название рубрики",
    });
    expect(button).toHaveTextContent("Редактировать");
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    const field = screen.getByLabelText("Название по-русски");
    expect(field).toHaveValue("Ари Мардан Прабху");
    expect(field).toHaveFocus();
  });

  it("Esc закрывает правку и возвращает фокус на кнопку", async () => {
    render(<CategoryTitleEdit locale="ru" category={category(true)} />);
    const button = screen.getByRole("button", {
      name: "Редактировать название рубрики",
    });
    fireEvent.click(button);

    fireEvent.keyDown(screen.getByLabelText("Название по-русски"), {
      key: "Escape",
    });

    expect(screen.queryByLabelText("Название по-русски")).toBeNull();
    await waitFor(() => expect(button).toHaveFocus());
  });
});
