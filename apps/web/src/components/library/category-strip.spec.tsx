import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryCategoryDto } from "@vedamatch/shared";
import { CategoryStrip } from "./category-strip";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function category(overrides: Partial<LibraryCategoryDto>): LibraryCategoryDto {
  return {
    id: "c1",
    parentId: null,
    slug: "propovedniki",
    titleRu: "Проповедники",
    titleEn: "Preachers",
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    depth: 0,
    entriesCount: 4,
    subtreeEntriesCount: 4,
    childrenCount: 0,
    createdAt: "2026-08-23T00:00:00.000Z",
    canEdit: false,
    canMove: false,
    canDelete: false,
    ...overrides,
  };
}

describe("CategoryStrip", () => {
  it("не обрезает счётчиком и кнопкой редактирования название категории", () => {
    render(
      <CategoryStrip locale="ru" categories={[category({ canEdit: true })]} />,
    );

    // Название — в собственной ссылке, без соседей внутри неё: раньше счётчик
    // и кнопка редактирования делили с ним одну строку и отъедали ширину.
    const link = screen.getByRole("link", { name: "Проповедники" });
    expect(link.textContent).toBe("Проповедники");
  });

  it("у автора нет карандаша — имя правят на его странице (VED-528)", () => {
    render(
      <CategoryStrip locale="ru" categories={[category({ canEdit: true })]} />,
    );

    expect(
      screen.queryByRole("button", { name: "Редактировать категорию" }),
    ).not.toBeInTheDocument();
  });

  it("число — в одной строке с именем, плитка по ширине имени (VED-528)", () => {
    render(
      <CategoryStrip
        locale="ru"
        categories={[category({ titleRu: "Аиндра Прабху", entriesCount: 1 })]}
      />,
    );

    const link = screen.getByRole("link", { name: "Аиндра Прабху" });
    const tile = link.parentElement!;
    expect(tile.className).toContain("flex-auto");
    expect(tile.className).not.toContain("flex-col");
    expect(link.className).toContain("truncate");
    expect(tile).toContainElement(screen.getByLabelText("Материалов: 1"));
  });

  describe("верхний уровень", () => {
    it("освобождает плитку: ни карандаша, ни значка у числа", () => {
      const { container } = render(
        <CategoryStrip
          locale="ru"
          root
          categories={[category({ canEdit: true, childrenCount: 4 })]}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Редактировать категорию" }),
      ).not.toBeInTheDocument();
      // Карандаш, папка и лист — всё это svg внутри плитки.
      expect(container.querySelector("svg")).toBeNull();
    });

    it("называет число словами: без значка «4» ничего не значит", () => {
      render(
        <CategoryStrip
          locale="ru"
          root
          categories={[category({ childrenCount: 4 })]}
        />,
      );

      expect(screen.getByText("4 подраздела")).toBeInTheDocument();
    });

    it("длинное название переносится, а не обрывается многоточием", () => {
      render(
        <CategoryStrip
          locale="ru"
          root
          categories={[category({ titleRu: "Философия и писания" })]}
        />,
      );

      // Прописные шире строчных: с `truncate` плитка показывала бы
      // «ФИЛОСОФИЯ И…» — ровно то, ради чего с неё убирали значки.
      const link = screen.getByRole("link", { name: "Философия и писания" });
      expect(link.className).toContain("line-clamp-2");
      expect(link.className).not.toContain("truncate");
    });

    it("рисует название прописными — чтобы уровень был виден", () => {
      render(<CategoryStrip locale="ru" root categories={[category({})]} />);

      expect(
        screen.getByRole("link", { name: "Проповедники" }).className,
      ).toContain("uppercase");
    });

    it("подраздел остаётся строчными, со значком у числа", () => {
      render(
        <CategoryStrip
          locale="ru"
          categories={[category({ canEdit: true, childrenCount: 4 })]}
        />,
      );

      expect(
        screen.getByRole("link", { name: "Проповедники" }).className,
      ).not.toContain("uppercase");
      expect(
        screen.getByLabelText("Подразделов внутри: 4"),
      ).toBeInTheDocument();
    });
  });
});
