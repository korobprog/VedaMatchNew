import { describe, expect, it } from "vitest";
import type { LibraryCategoryTreeNode } from "@vedamatch/shared";
import { authorLineageRows, suggestedEntryLineage } from "./author-lineage";

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

const tree: LibraryCategoryTreeNode[] = [
  node("preachers", {
    titleRu: "Проповедники",
    subtreeEntriesCount: 5,
    children: [
      node("ari", {
        parentId: "preachers",
        titleRu: "Ари Мардан Прабху",
        lineage: "sri_gopinath_gaudiya_math",
        subtreeEntriesCount: 3,
        children: [
          node("ari-lectures", {
            parentId: "ari",
            titleRu: "Лекции",
            subtreeEntriesCount: 2,
          }),
        ],
      }),
      node("bhakti", {
        parentId: "preachers",
        titleRu: "Бхакти Вигьяна Госвами",
        lineage: "iskcon",
      }),
    ],
  }),
];

describe("suggestedEntryLineage", () => {
  it("линия автора у самой рубрики и у подрубрики", () => {
    expect(suggestedEntryLineage(tree, ["ari"], "iskcon")).toBe(
      "sri_gopinath_gaudiya_math",
    );
    expect(suggestedEntryLineage(tree, ["ari-lectures"], "iskcon")).toBe(
      "sri_gopinath_gaudiya_math",
    );
  });

  it("без линии у рубрик — запасная", () => {
    expect(suggestedEntryLineage(tree, ["preachers"], "ipbys")).toBe("ipbys");
    expect(suggestedEntryLineage(tree, [], "ipbys")).toBe("ipbys");
  });
});

describe("authorLineageRows", () => {
  it("всё дерево по порядку, с путём предков и линией", () => {
    const rows = authorLineageRows(tree);

    expect(rows.map((row) => [row.id, row.depth, row.trail])).toEqual([
      ["preachers", 0, ""],
      ["ari", 1, "Проповедники"],
      ["ari-lectures", 2, "Проповедники → Ари Мардан Прабху"],
      ["bhakti", 1, "Проповедники"],
    ]);
    expect(rows[1]).toMatchObject({
      title: "Ари Мардан Прабху",
      lineage: "sri_gopinath_gaudiya_math",
      entries: 3,
    });
    expect(rows[0].lineage).toBeNull();
  });

  it("ищет по названию без учёта регистра", () => {
    expect(authorLineageRows(tree, "  ари ").map((row) => row.id)).toEqual([
      "ari",
    ]);
    expect(authorLineageRows(tree, "нет такого")).toEqual([]);
  });
});
