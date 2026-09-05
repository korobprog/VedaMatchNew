import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      <CategoryStrip
        locale="ru"
        categories={[category({ canEdit: true })]}
      />,
    );

    // Название — в собственной ссылке, без соседей внутри неё: раньше счётчик
    // и кнопка редактирования делили с ним одну строку и отъедали ширину.
    const link = screen.getByRole("link", { name: "Проповедники" });
    expect(link.textContent).toBe("Проповедники");
  });

  it("кнопка редактирования не абсолютно спозиционирована поверх соседних плиток", () => {
    const { container } = render(
      <CategoryStrip
        locale="ru"
        categories={[
          category({ id: "c1", slug: "guru", titleRu: "Гуру", canEdit: true }),
          category({ id: "c2", slug: "zdorovye", titleRu: "Здоровье" }),
        ]}
      />,
    );

    // Раньше форма редактирования наследовала `absolute right-2 top-2` от
    // обёртки-триггера и могла наплыть на соседнюю плитку в сетке.
    expect(container.querySelector(".absolute")).toBeNull();
  });

  it("открывает форму редактирования без переноса иконки редактирования на название", async () => {
    const user = userEvent.setup();
    render(
      <CategoryStrip
        locale="ru"
        categories={[category({ canEdit: true })]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Редактировать категорию" }));

    expect(
      screen.getByText("Редактировать категорию: Проповедники"),
    ).toBeInTheDocument();
  });

  it("не показывает кнопку редактирования без прав", () => {
    render(
      <CategoryStrip locale="ru" categories={[category({ canEdit: false })]} />,
    );

    expect(
      screen.queryByRole("button", { name: "Редактировать категорию" }),
    ).not.toBeInTheDocument();
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

    it("рисует название прописными — чтобы уровень был виден", () => {
      render(
        <CategoryStrip locale="ru" root categories={[category({})]} />,
      );

      expect(
        screen.getByRole("link", { name: "Проповедники" }).className,
      ).toContain("uppercase");
    });

    it("подраздел остаётся как был: строчными, со значком и карандашом", () => {
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
        screen.getByRole("button", { name: "Редактировать категорию" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Подразделов внутри: 4")).toBeInTheDocument();
    });
  });
});
