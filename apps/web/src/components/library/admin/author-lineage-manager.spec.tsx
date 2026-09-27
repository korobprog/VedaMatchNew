import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryCategoryTreeNode } from "@vedamatch/shared";
import { LibraryAuthorLineageManager } from "./author-lineage-manager";

const setLibraryCategoryLineage = vi.fn();
const applyLibraryAuthorLineage = vi.fn();

vi.mock("@/lib/library-admin-api", () => ({
  setLibraryCategoryLineage: (...args: unknown[]) =>
    setLibraryCategoryLineage(...args),
  applyLibraryAuthorLineage: (...args: unknown[]) =>
    applyLibraryAuthorLineage(...args),
}));

function node(
  id: string,
  overrides: Partial<LibraryCategoryTreeNode> = {},
): LibraryCategoryTreeNode {
  return {
    id,
    parentId: null,
    slug: id,
    titleRu: id,
    titleEn: null,
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    depth: 0,
    entriesCount: 0,
    subtreeEntriesCount: 0,
    childrenCount: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    canEdit: true,
    canMove: true,
    canDelete: true,
    children: [],
    ...overrides,
  };
}

const tree = [
  node("preachers", {
    titleRu: "Проповедники",
    subtreeEntriesCount: 4,
    children: [
      node("ari", {
        parentId: "preachers",
        titleRu: "Ари Мардан Прабху",
        subtreeEntriesCount: 4,
      }),
    ],
  }),
];

afterEach(() => {
  setLibraryCategoryLineage.mockReset();
  applyLibraryAuthorLineage.mockReset();
  vi.restoreAllMocks();
});

describe("LibraryAuthorLineageManager", () => {
  it("выбор линии сохраняется у автора и открывает «Применить»", async () => {
    setLibraryCategoryLineage.mockResolvedValue({
      id: "ari",
      lineage: "ipbys",
    });
    render(<LibraryAuthorLineageManager initialTree={tree} />);

    const apply = screen.getAllByRole("button", {
      name: "Применить ко всем материалам автора",
    })[1];
    expect((apply as HTMLButtonElement).disabled).toBe(true);

    // Два шага (VED-568): группа сама ничего не сохраняет, матх — да.
    await userEvent.selectOptions(
      screen.getByLabelText("Линия автора: Ари Мардан Прабху"),
      "gaudiya_math",
    );
    expect(setLibraryCategoryLineage).not.toHaveBeenCalled();
    await userEvent.selectOptions(
      screen.getByLabelText(
        "Линия автора: Ари Мардан Прабху: какой именно матх",
      ),
      "ipbys",
    );

    expect(setLibraryCategoryLineage).toHaveBeenCalledWith("ari", "ipbys");
    await waitFor(() =>
      expect((apply as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("«Применить» спрашивает подтверждение и без него ничего не шлёт", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <LibraryAuthorLineageManager
        initialTree={[
          {
            ...tree[0],
            children: [{ ...tree[0].children[0], lineage: "iskcon" }],
          },
        ]}
      />,
    );

    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Применить ко всем материалам автора",
      })[1],
    );

    expect(confirm).toHaveBeenCalled();
    expect(applyLibraryAuthorLineage).not.toHaveBeenCalled();
  });

  it("после подтверждения применяет и сообщает, скольким материалам", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    applyLibraryAuthorLineage.mockResolvedValue({
      lineage: "iskcon",
      updated: 3,
    });
    render(
      <LibraryAuthorLineageManager
        initialTree={[
          {
            ...tree[0],
            children: [{ ...tree[0].children[0], lineage: "iskcon" }],
          },
        ]}
      />,
    );

    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Применить ко всем материалам автора",
      })[1],
    );

    expect(applyLibraryAuthorLineage).toHaveBeenCalledWith("ari");
    expect((await screen.findByRole("status")).textContent).toBe(
      "«Ари Мардан Прабху»: линия проставлена материалам — 3",
    );
  });
});
