import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryCategoryTreeNode } from "@vedamatch/shared";
import { CategoryNavigator } from "./category-navigator";

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
});

describe("CategoryNavigator — порядок рубрик", () => {
  it("по умолчанию показывает свой порядок, выставленный перетаскиванием", () => {
    setup();
    expect(shownOrder()).toEqual(["Философия", "Ёлка", "Музыка"]);
  });

  it("переставляет по алфавиту", async () => {
    const user = userEvent.setup();
    setup();

    await user.selectOptions(
      screen.getByLabelText("Порядок рубрик"),
      "По алфавиту",
    );

    expect(shownOrder()).toEqual(["Ёлка", "Музыка", "Философия"]);
  });

  it("переставляет по дате — сначала новые", async () => {
    const user = userEvent.setup();
    setup();

    await user.selectOptions(
      screen.getByLabelText("Порядок рубрик"),
      "Сначала новые",
    );

    expect(shownOrder()).toEqual(["Музыка", "Философия", "Ёлка"]);
  });

  it("помнит выбор между заходами", async () => {
    const user = userEvent.setup();
    const first = setup();
    await user.selectOptions(
      screen.getByLabelText("Порядок рубрик"),
      "По алфавиту",
    );
    first.unmount();

    setup();

    expect(await screen.findByDisplayValue("По алфавиту")).toBeInTheDocument();
    expect(shownOrder()).toEqual(["Ёлка", "Музыка", "Философия"]);
  });

  it("мусор в хранилище не ломает показ", () => {
    window.localStorage.setItem("vedamatch:library-category-order", "что попало");
    setup();

    expect(shownOrder()).toEqual(["Философия", "Ёлка", "Музыка"]);
  });

  it("выбор порядка есть и у того, кому дерево менять нельзя", () => {
    setup(false);

    expect(screen.getByLabelText("Порядок рубрик")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Упорядочить/ }),
    ).not.toBeInTheDocument();
  });

  it("на одной рубрике выбора порядка нет", () => {
    const only = [tree()[0]];
    render(
      <CategoryNavigator
        locale="ru"
        categories={only}
        tree={only}
        canOrganize={false}
        root
      />,
    );

    expect(screen.queryByLabelText("Порядок рубрик")).not.toBeInTheDocument();
  });

  it("упорядочивание показывает настоящий порядок дерева, а не алфавит", async () => {
    const user = userEvent.setup();
    setup(true);
    await user.selectOptions(
      screen.getByLabelText("Порядок рубрик"),
      "По алфавиту",
    );

    await user.click(screen.getByRole("button", { name: /Упорядочить/ }));

    // Перекладывать вслепую нельзя: строка встала бы не туда, куда её кладут.
    expect(
      screen.getAllByRole("treeitem").map((item) =>
        within(item).getByText(/Философия|Ёлка|Музыка/).textContent,
      ),
    ).toEqual(["Философия", "Ёлка", "Музыка"]);
  });
});
