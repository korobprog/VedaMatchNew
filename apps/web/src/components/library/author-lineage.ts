import {
  authorLineageFor,
  toLineageId,
  type LibraryCategoryTreeNode,
  type LineageId,
} from "@vedamatch/shared";
import { flattenTree } from "./category-tree";

/**
 * Линия автора (VED-548) на вебе: подсказка формам и строки админки.
 * Правило «рубрика или ближайший предок» — общее с сервером,
 * `authorLineageFor` из @vedamatch/shared.
 */

/**
 * Линия нового материала, пока человек не выбрал её сам: автора-рубрики,
 * иначе `fallback` — линия добавившего либо ISKCON (`defaultLineageFor`).
 * Ровно то, что подставил бы сервер, не придя поле вовсе.
 */
export function suggestedEntryLineage(
  tree: LibraryCategoryTreeNode[],
  selectedIds: readonly string[],
  fallback: LineageId,
): LineageId {
  const byId = new Map(flattenTree(tree).map((row) => [row.id, row.node]));
  return authorLineageFor(selectedIds, (id) => byId.get(id)) ?? fallback;
}

export interface AuthorLineageRow {
  id: string;
  depth: number;
  title: string;
  /** Путь предков для подписи: «Проповедники →». Пусто у верхнего уровня. */
  trail: string;
  lineage: LineageId | null;
  /** Материалы рубрики с подрубриками — столько затронет «Применить». */
  entries: number;
}

function titleOf(node: {
  titleRu: string | null;
  titleEn: string | null;
  slug: string;
}) {
  return node.titleRu ?? node.titleEn ?? node.slug;
}

/**
 * Строки экрана «Линии авторов»: дерево по порядку, с отбором по названию.
 * Совпавшая рубрика тянет за собой путь предков в подписи, а не сами строки
 * предков: искали автора, а не раздел.
 */
export function authorLineageRows(
  tree: LibraryCategoryTreeNode[],
  query = "",
): AuthorLineageRow[] {
  const rows = flattenTree(tree);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const needle = query.trim().toLocaleLowerCase("ru");

  return rows
    .map((row) => {
      const trail: string[] = [];
      let parentId = row.parentId;
      while (parentId) {
        const parent = byId.get(parentId);
        if (!parent) break;
        trail.unshift(titleOf(parent.node));
        parentId = parent.parentId;
      }
      return {
        id: row.id,
        depth: row.depth,
        title: titleOf(row.node),
        trail: trail.join(" → "),
        lineage: toLineageId(row.node.lineage),
        entries: row.node.subtreeEntriesCount,
      };
    })
    .filter(
      (row) => !needle || row.title.toLocaleLowerCase("ru").includes(needle),
    );
}
