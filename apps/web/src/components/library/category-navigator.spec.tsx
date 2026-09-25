import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryCategoryTreeNode } from "@vedamatch/shared";
import { CategoryNavigator } from "./category-navigator";
import { LibraryOrganizeButton } from "./organize-button";
import { setOrganizing } from "./organize-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/http-client", () => ({ apiFetch: vi.fn() }));

function node(
  id: string,
  titleRu: string,
  position: number,
  createdAt: string,
): LibraryCategoryTreeNode {
  return {
    id,
    parentId: null,
    slug: id,
    titleRu,
    titleEn: titleRu,
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position,
    depth: 0,
    entriesCount: 0,
    subtreeEntriesCount: 0,
    childrenCount: 0,
    createdAt,
    canEdit: false,
    canMove: false,
    canDelete: false,
    children: [],
  };
}

/** Свой порядок: Философия, Ёлка, Музыка. Ни алфавит, ни дата с ним не совпадают. */
function tree(): LibraryCategoryTreeNode[] {
  return [
    node("f", "Философия", 0, "2026-03-01T00:00:00.000Z"),
    node("y", "Ёлка", 1, "2026-01-01T00:00:00.000Z"),
    node("m", "Музыка", 2, "2026-05-01T00:00:00.000Z"),
  ];
}

function setup(canOrganize = false) {
  const categories = tree();
  return render(
    <CategoryNavigator
      locale="ru"
      categories={categories}
      tree={categories}
      canOrganize={canOrganize}
      root
    />,
  );
}

function shownOrder() {
  return screen
    .getAllByRole("link")
    .map((link) => link.textContent?.trim() ?? "");
}

beforeEach(() => {
  window.localStorage.clear();
  setOrganizing(false);
});

describe("CategoryNavigator (VED-483)", () => {
  it("рубрики — в своём порядке, выставленном перетаскиванием", () => {
    setup();
    expect(shownOrder()).toEqual(["Философия", "Ёлка", "Музыка"]);
  });

  it("выбора порядка больше нет — ни подписи, ни списка", () => {
    setup(true);
    expect(screen.queryByText("Порядок рубрик")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("без права менять дерево — никаких кнопок", () => {
    setup(false);
    expect(
      screen.queryByRole("button", { name: /Упорядочить/ }),
    ).not.toBeInTheDocument();
  });

  it("«Упорядочить» над рубриками открывает дерево в настоящем порядке", async () => {
    const user = userEvent.setup();
    setup(true);
    await user.click(screen.getByRole("button", { name: /Упорядочить/ }));
    expect(
      screen.getAllByRole("treeitem").map((item) =>
        within(item).getByText(/Философия|Ёлка|Музыка/).textContent,
      ),
    ).toEqual(["Философия", "Ёлка", "Музыка"]);
  });

  it("кнопка в ряду страницы управляет тем же деревом", async () => {
    const user = userEvent.setup();
    const categories = tree();
    render(
      <>
        <LibraryOrganizeButton locale="ru" />
        <CategoryNavigator
          locale="ru"
          categories={categories}
          tree={categories}
          canOrganize
          root
          organizeInToolbar
        />
      </>,
    );
    expect(screen.getAllByRole("button", { name: /Упорядочить/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /Упорядочить/ }));
    expect(screen.getAllByRole("treeitem")).toHaveLength(3);
  });
});
