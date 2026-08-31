import { LIBRARY_MAX_DEPTH } from "@vedamatch/shared";
import type {
  LibraryCategoryDto,
  LibraryCategoryTreeNode,
} from "@vedamatch/shared";

/**
 * Раскладка дерева рубрик в плоский список и математика перетаскивания.
 *
 * Модель жеста — «позиция по вертикали, глубина по горизонтали»: тянешь
 * вверх-вниз, меняешь порядок; тянешь вправо-влево, меняешь уровень. Одно
 * правило на мышь и на палец, и «вынести обратно в корень» — это движение
 * влево, а не поиск отдельной зоны сброса.
 *
 * Здесь всё чистое: пиксели превращает в индекс и уровень вызывающий
 * компонент, а решения принимаются над числами — их можно проверить тестом.
 */

export interface FlatRow {
  id: string;
  parentId: string | null;
  depth: number;
  node: LibraryCategoryTreeNode;
}

/** Дерево → порядок обхода сверху вниз. Свёрнутые ветки не разворачиваются. */
export function flattenTree(
  nodes: LibraryCategoryTreeNode[],
  collapsed: ReadonlySet<string> = new Set(),
  parentId: string | null = null,
  depth = 0,
): FlatRow[] {
  return nodes.flatMap((node) => {
    const row: FlatRow = { id: node.id, parentId, depth, node };
    if (collapsed.has(node.id)) return [row];
    return [row, ...flattenTree(node.children, collapsed, node.id, depth + 1)];
  });
}

/** Идентификаторы узла и всех его потомков. */
export function subtreeIds(rows: FlatRow[], id: string): string[] {
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return [];
  const base = rows[index].depth;
  const out = [id];
  for (let i = index + 1; i < rows.length && rows[i].depth > base; i += 1) {
    out.push(rows[i].id);
  }
  return out;
}

/** Высота поддерева в уровнях: лист — 0. */
export function subtreeHeight(rows: FlatRow[], id: string): number {
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return 0;
  const base = rows[index].depth;
  let height = 0;
  for (let i = index + 1; i < rows.length && rows[i].depth > base; i += 1) {
    height = Math.max(height, rows[i].depth - base);
  }
  return height;
}

export interface DropTarget {
  parentId: string | null;
  /** Перед каким соседом встать; `null` — последним. */
  beforeId: string | null;
  /** Уровень, на котором окажется узел: рисуем по нему отступ линии вставки. */
  depth: number;
}

/**
 * Куда попадёт узел, если отпустить его между `overIndex - 1` и `overIndex`
 * списка без собственного поддерева, потянув до уровня `desiredDepth`.
 *
 * Уровень зажимается соседями: глубже, чем «ребёнок строки сверху», уйти
 * некуда, а мельче, чем строка снизу, — значит разорвать её ветку. Так
 * промах пальцем даёт ближайшее осмысленное место, а не отказ.
 */
export function projectDrop(
  rows: FlatRow[],
  activeId: string,
  overIndex: number,
  desiredDepth: number,
  maxDepth: number = LIBRARY_MAX_DEPTH,
): DropTarget {
  const height = subtreeHeight(rows, activeId);
  const rest = withoutSubtree(rows, activeId);
  const index = Math.max(0, Math.min(overIndex, rest.length));

  const previous = rest[index - 1] ?? null;
  const next = rest[index] ?? null;

  const ceiling = Math.min(
    previous ? previous.depth + 1 : 0,
    maxDepth - height,
  );
  const floor = next ? next.depth : 0;
  const depth = Math.max(0, Math.min(Math.max(desiredDepth, floor), ceiling));

  const parentId = ancestorAt(rest, index - 1, depth);
  const beforeId = next && next.parentId === parentId ? next.id : null;

  return { parentId, beforeId, depth };
}

/** Список без перетаскиваемого узла и его потомков. */
export function withoutSubtree(rows: FlatRow[], id: string): FlatRow[] {
  const dragged = new Set(subtreeIds(rows, id));
  return rows.filter((row) => !dragged.has(row.id));
}

/** Ближайший сверху предок нужного уровня — будущий родитель. */
function ancestorAt(
  rows: FlatRow[],
  fromIndex: number,
  depth: number,
): string | null {
  if (depth === 0) return null;
  for (let i = fromIndex; i >= 0; i -= 1) {
    if (rows[i].depth === depth - 1) return rows[i].id;
  }
  return null;
}

/** Стало бы перемещение изменением? Пустой ход не стоит запроса к серверу. */
export function isNoopMove(
  rows: FlatRow[],
  activeId: string,
  target: DropTarget,
): boolean {
  const row = rows.find((item) => item.id === activeId);
  if (!row || row.parentId !== target.parentId) return false;

  const siblings = rows.filter((item) => item.parentId === row.parentId);
  const at = siblings.findIndex((item) => item.id === activeId);
  const nextSibling = siblings[at + 1] ?? null;
  return (target.beforeId ?? null) === (nextSibling?.id ?? null);
}

/**
 * Дерево после перемещения — для оптимистичного показа.
 *
 * Сервер всё равно вернёт свою версию и она победит; здесь важно лишь
 * убрать задержку между отпусканием пальца и перерисовкой.
 */
export function applyMove(
  nodes: LibraryCategoryTreeNode[],
  activeId: string,
  target: DropTarget,
): LibraryCategoryTreeNode[] {
  const moved = findNode(nodes, activeId);
  if (!moved) return nodes;

  const detached = detach(nodes, activeId);
  const inserted = insert(detached, target, withDepth(moved, target.depth));
  return inserted;
}

function findNode(
  nodes: LibraryCategoryTreeNode[],
  id: string,
): LibraryCategoryTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

function detach(
  nodes: LibraryCategoryTreeNode[],
  id: string,
): LibraryCategoryTreeNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: detach(node.children, id) }));
}

function insert(
  nodes: LibraryCategoryTreeNode[],
  target: DropTarget,
  moved: LibraryCategoryTreeNode,
): LibraryCategoryTreeNode[] {
  if (target.parentId === null) {
    return spliceInto(nodes, target.beforeId, moved, null);
  }
  return nodes.map((node) =>
    node.id === target.parentId
      ? {
          ...node,
          children: spliceInto(node.children, target.beforeId, moved, node.id),
          childrenCount: node.childrenCount + 1,
        }
      : { ...node, children: insert(node.children, target, moved) },
  );
}

function spliceInto(
  siblings: LibraryCategoryTreeNode[],
  beforeId: string | null,
  moved: LibraryCategoryTreeNode,
  parentId: string | null,
): LibraryCategoryTreeNode[] {
  const next = { ...moved, parentId };
  const at = beforeId
    ? siblings.findIndex((node) => node.id === beforeId)
    : siblings.length;
  const index = at === -1 ? siblings.length : at;
  const result = [
    ...siblings.slice(0, index),
    next,
    ...siblings.slice(index),
  ];
  return result.map((node, position) => ({ ...node, position }));
}

/** Пересчёт глубины у переехавшего узла и его потомков. */
function withDepth(
  node: LibraryCategoryTreeNode,
  depth: number,
): LibraryCategoryTreeNode {
  return {
    ...node,
    depth,
    children: node.children.map((child) => withDepth(child, depth + 1)),
  };
}

/**
 * Узлы, куда рубрику пускать нельзя: она сама, её потомки и всё, что
 * оказалось бы слишком глубоко. Нужен и шторке «Переместить в…», и
 * подсветке недопустимой цели при перетаскивании.
 */
export function forbiddenTargets(
  rows: FlatRow[],
  activeId: string,
  maxDepth: number = LIBRARY_MAX_DEPTH,
): Set<string> {
  const height = subtreeHeight(rows, activeId);
  const forbidden = new Set(subtreeIds(rows, activeId));
  for (const row of rows) {
    if (row.depth + 1 + height > maxDepth) forbidden.add(row.id);
  }
  return forbidden;
}

/**
 * Переименованная рубрика в дереве.
 *
 * Формы добавления и правки материала держат дерево в состоянии: без этого
 * переименование становилось бы видно только после перезагрузки страницы.
 */
export function renameInTree(
  nodes: LibraryCategoryTreeNode[],
  updated: LibraryCategoryDto,
): LibraryCategoryTreeNode[] {
  return nodes.map((node) =>
    node.id === updated.id
      ? { ...node, ...updated, children: node.children }
      : { ...node, children: renameInTree(node.children, updated) },
  );
}

/** Только что созданная рубрика — сразу на своё место под родителем. */
export function insertIntoTree(
  nodes: LibraryCategoryTreeNode[],
  created: LibraryCategoryDto,
): LibraryCategoryTreeNode[] {
  const node: LibraryCategoryTreeNode = { ...created, children: [] };
  if (created.parentId === null) return [...nodes, node];

  return nodes.map((item) =>
    item.id === created.parentId
      ? {
          ...item,
          children: [...item.children, node],
          childrenCount: item.childrenCount + 1,
        }
      : { ...item, children: insertIntoTree(item.children, created) },
  );
}

/**
 * Удалённая рубрика — вон из дерева.
 *
 * Только сам узел: сервер удаляет рубрику лишь пустую и бездетную, так что
 * поддерева у неё нет и уносить с собой ей нечего. Счётчик детей у родителя
 * уменьшается тут же — иначе строка обещала бы «3 подраздела» там, где их
 * осталось два, до ближайшей перезагрузки.
 */
export function removeFromTree(
  nodes: LibraryCategoryTreeNode[],
  id: string,
): LibraryCategoryTreeNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => {
      const children = removeFromTree(node.children, id);
      return children.length === node.children.length
        ? { ...node, children }
        : { ...node, children, childrenCount: children.length };
    });
}

/**
 * Что за число стоит рядом с рубрикой.
 *
 * Правило одно на все списки: рубрика показывает то, что лежит **прямо в
 * ней**, и ничего больше. Есть подразделы — их и считаем; подразделов нет —
 * считаем материалы.
 *
 * До этого везде стоял `subtreeEntriesCount`, и корень показывал материалы,
 * которых в нём самом нет: «Философия · 47», где все сорок семь лежат в
 * подразделах, а по клику открывается пустой список. Число обещало одно, а
 * страница показывала другое.
 *
 * Оба смысла не смешиваются в одну цифру намеренно: «4 подраздела» и
 * «4 материала» — разные вещи, и складывать их в «4» значит снова врать.
 * Поэтому наружу уходит и вид, и величина — подпись рядом называет вид.
 */
export function categoryCounter(category: {
  childrenCount: number;
  entriesCount: number;
}): { kind: "children" | "entries"; value: number } {
  return category.childrenCount > 0
    ? { kind: "children", value: category.childrenCount }
    : { kind: "entries", value: category.entriesCount };
}
