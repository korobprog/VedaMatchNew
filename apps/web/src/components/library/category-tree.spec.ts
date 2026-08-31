import { describe, expect, it } from "vitest";
import type { LibraryCategoryTreeNode } from "@vedamatch/shared";
import {
  applyMove,
  categoryCounter,
  flattenTree,
  forbiddenTargets,
  insertIntoTree,
  isNoopMove,
  projectDrop,
  renameInTree,
  subtreeHeight,
  subtreeIds,
  withoutSubtree,
} from "./category-tree";

function node(
  id: string,
  depth: number,
  parentId: string | null,
  children: LibraryCategoryTreeNode[] = [],
): LibraryCategoryTreeNode {
  return {
    id,
    parentId,
    slug: id,
    titleRu: id,
    titleEn: id,
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    depth,
    entriesCount: 0,
    subtreeEntriesCount: 0,
    childrenCount: children.length,
    createdAt: "2026-08-29T00:00:00.000Z",
    canEdit: true,
    canMove: true,
    canDelete: true,
    children,
  };
}

/**
 *   philosophy
 *     prabhupada
 *       lectures
 *     bhagavatam
 *   music
 */
function tree(): LibraryCategoryTreeNode[] {
  return [
    node("philosophy", 0, null, [
      node("prabhupada", 1, "philosophy", [
        node("lectures", 2, "prabhupada"),
      ]),
      node("bhagavatam", 1, "philosophy"),
    ]),
    node("music", 0, null),
  ];
}

const rows = () => flattenTree(tree());

describe("flattenTree", () => {
  it("обходит сверху вниз с глубиной и родителем", () => {
    expect(rows().map((row) => [row.id, row.depth, row.parentId])).toEqual([
      ["philosophy", 0, null],
      ["prabhupada", 1, "philosophy"],
      ["lectures", 2, "prabhupada"],
      ["bhagavatam", 1, "philosophy"],
      ["music", 0, null],
    ]);
  });

  it("свёрнутая ветка не раскрывается", () => {
    const flat = flattenTree(tree(), new Set(["prabhupada"]));
    expect(flat.map((row) => row.id)).toEqual([
      "philosophy",
      "prabhupada",
      "bhagavatam",
      "music",
    ]);
  });
});

describe("subtreeIds, subtreeHeight, withoutSubtree", () => {
  it("собирает поддерево вместе с корнем", () => {
    expect(subtreeIds(rows(), "philosophy")).toEqual([
      "philosophy",
      "prabhupada",
      "lectures",
      "bhagavatam",
    ]);
  });

  it("высота считается по самому глубокому потомку", () => {
    expect(subtreeHeight(rows(), "philosophy")).toBe(2);
    expect(subtreeHeight(rows(), "prabhupada")).toBe(1);
    expect(subtreeHeight(rows(), "music")).toBe(0);
  });

  it("перетаскиваемое поддерево исчезает из списка целей", () => {
    expect(withoutSubtree(rows(), "prabhupada").map((row) => row.id)).toEqual([
      "philosophy",
      "bhagavatam",
      "music",
    ]);
  });
});

describe("projectDrop: вертикаль", () => {
  it("между корнями даёт верхний уровень", () => {
    // Список без «music»: philosophy, prabhupada, lectures, bhagavatam.
    expect(projectDrop(rows(), "music", 0, 0)).toMatchObject({
      parentId: null,
      beforeId: "philosophy",
      depth: 0,
    });
  });

  it("в конце списка встаёт последним без соседа", () => {
    expect(projectDrop(rows(), "music", 4, 0)).toMatchObject({
      parentId: null,
      beforeId: null,
    });
  });
});

describe("projectDrop: горизонталь", () => {
  it("тяга вправо вкладывает в строку сверху", () => {
    // После «bhagavatam» (уровень 1) с запросом на уровень 2.
    const target = projectDrop(rows(), "music", 4, 2);
    expect(target).toMatchObject({ parentId: "bhagavatam", depth: 2 });
  });

  it("тяга влево выносит в корень", () => {
    const target = projectDrop(rows(), "bhagavatam", 3, 0);
    expect(target).toMatchObject({ parentId: null, depth: 0 });
  });

  it("глубже строки сверху уйти нельзя", () => {
    // Над «philosophy» нет ничего, поэтому уровень только нулевой.
    expect(projectDrop(rows(), "music", 0, 5).depth).toBe(0);
  });

  it("мельче строки снизу тоже нельзя — иначе рвётся её ветка", () => {
    // Между «prabhupada» и «lectures»: снизу уровень 2, туда и прижимает.
    const target = projectDrop(rows(), "music", 2, 0);
    expect(target.depth).toBe(2);
    expect(target.parentId).toBe("prabhupada");
  });

  it("поддерево не пускают глубже предела", () => {
    // «prabhupada» высотой 1: сам глубже первого уровня встать не может.
    const target = projectDrop(rows(), "prabhupada", 2, 2);
    expect(target.depth).toBeLessThanOrEqual(1);
  });
});

describe("isNoopMove", () => {
  it("возврат на своё место изменением не считается", () => {
    const target = { parentId: "philosophy", beforeId: "bhagavatam", depth: 1 };
    expect(isNoopMove(rows(), "prabhupada", target)).toBe(true);
  });

  it("смена родителя — всегда изменение", () => {
    const target = { parentId: "music", beforeId: null, depth: 1 };
    expect(isNoopMove(rows(), "prabhupada", target)).toBe(false);
  });

  it("перестановка среди своих — изменение", () => {
    const target = { parentId: "philosophy", beforeId: "prabhupada", depth: 1 };
    expect(isNoopMove(rows(), "bhagavatam", target)).toBe(false);
  });
});

describe("applyMove", () => {
  it("переносит узел вместе с поддеревом и пересчитывает глубину", () => {
    const next = applyMove(tree(), "prabhupada", {
      parentId: "music",
      beforeId: null,
      depth: 1,
    });

    const music = next.find((item) => item.id === "music")!;
    expect(music.children.map((child) => child.id)).toEqual(["prabhupada"]);
    expect(music.children[0].depth).toBe(1);
    expect(music.children[0].children[0]).toMatchObject({
      id: "lectures",
      depth: 2,
    });

    const philosophy = next.find((item) => item.id === "philosophy")!;
    expect(philosophy.children.map((child) => child.id)).toEqual([
      "bhagavatam",
    ]);
  });

  it("вынос в корень встаёт перед указанным соседом", () => {
    const next = applyMove(tree(), "bhagavatam", {
      parentId: null,
      beforeId: "music",
      depth: 0,
    });

    expect(next.map((item) => item.id)).toEqual([
      "philosophy",
      "bhagavatam",
      "music",
    ]);
    expect(next.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it("неизвестный узел оставляет дерево как было", () => {
    const before = tree();
    expect(applyMove(before, "ghost", {
      parentId: null,
      beforeId: null,
      depth: 0,
    })).toBe(before);
  });
});

describe("forbiddenTargets", () => {
  it("своё поддерево целью не бывает", () => {
    const forbidden = forbiddenTargets(rows(), "philosophy");
    expect(forbidden.has("philosophy")).toBe(true);
    expect(forbidden.has("prabhupada")).toBe(true);
    expect(forbidden.has("lectures")).toBe(true);
  });

  it("слишком глубокая цель тоже закрыта", () => {
    // Внутрь «lectures» (уровень 2) не влезает уже ничто.
    expect(forbiddenTargets(rows(), "music").has("lectures")).toBe(true);
  });

  it("лист пускают на предельный уровень", () => {
    expect(forbiddenTargets(rows(), "music").has("prabhupada")).toBe(false);
  });
});

describe("renameInTree и insertIntoTree", () => {
  it("переименование находит узел на любой глубине", () => {
    const next = renameInTree(tree(), {
      ...node("lectures", 2, "prabhupada"),
      titleRu: "Лекции",
    });
    const found = next[0].children[0].children[0];
    expect(found.titleRu).toBe("Лекции");
    expect(found.id).toBe("lectures");
  });

  it("новая рубрика встаёт под своим родителем", () => {
    const next = insertIntoTree(tree(), node("gita", 1, "philosophy"));
    expect(next[0].children.map((child) => child.id)).toEqual([
      "prabhupada",
      "bhagavatam",
      "gita",
    ]);
    expect(next[0].childrenCount).toBe(3);
  });

  it("рубрика верхнего уровня встаёт в конец корней", () => {
    const next = insertIntoTree(tree(), node("astro", 0, null));
    expect(next.map((item) => item.id)).toEqual([
      "philosophy",
      "music",
      "astro",
    ]);
  });
});

describe("categoryCounter", () => {
  it("у рубрики с подразделами считает подразделы", () => {
    expect(
      categoryCounter({ childrenCount: 4, entriesCount: 0 }),
    ).toEqual({ kind: "children", value: 4 });
  });

  it("материалы самой рубрики не подмешиваются к числу подразделов", () => {
    // «Философия» может держать и свои материалы, и подразделы. Показываем
    // подразделы: по клику человек попадёт именно в них.
    expect(
      categoryCounter({ childrenCount: 3, entriesCount: 12 }),
    ).toEqual({ kind: "children", value: 3 });
  });

  it("у листа считает его собственные материалы", () => {
    expect(
      categoryCounter({ childrenCount: 0, entriesCount: 12 }),
    ).toEqual({ kind: "entries", value: 12 });
  });

  it("пустой лист показывает ноль, а не прячет число", () => {
    // Ноль — это ответ «тут пусто», и он полезнее отсутствия числа.
    expect(
      categoryCounter({ childrenCount: 0, entriesCount: 0 }),
    ).toEqual({ kind: "entries", value: 0 });
  });
});
