/**
 * Дерево рубрик справочника: путь, глубина, перемещение.
 *
 * Всё здесь — чистые функции над плоским списком строк. Проверки цикла и
 * глубины обязаны жить на сервере: интерфейс их тоже делает, но запрос
 * `move` приходит и мимо интерфейса, а испорченное дерево чинится только
 * руками в базе.
 */

/** Корень (0) → потомок (1) → потомок потомка (2). Глубже отступы на
 *  телефоне съедают строку, а хлебные крошки перестают помещаться. */
export const MAX_DEPTH = 2;

export interface TreeRow {
  id: string;
  parentId: string | null;
  path: string;
  position: number;
}

/**
 * Путь предков вида `.<id>.<id>.`; у корня — пустая строка.
 *
 * Отдельная ветка для корня нужна из-за ведущей точки: она принадлежит
 * первому предку, а у корня предков нет. Хранить у корня одну точку было бы
 * ровнее в коде, но пустая строка честнее читается в базе.
 */
export function childPath(parent: { id: string; path: string } | null): string {
  if (!parent) return '';
  return parent.path ? `${parent.path}${parent.id}.` : `.${parent.id}.`;
}

/** Глубина по числу предков в пути: `''` → 0, `.a.` → 1, `.a.b.` → 2. */
export function depthOf(path: string): number {
  if (!path) return 0;
  return path.split('.').filter(Boolean).length;
}

/** Потомок ли `row` для узла `ancestorId` — по префиксу пути. */
export function isDescendantOf(row: { path: string }, ancestorId: string): boolean {
  return row.path.includes(`.${ancestorId}.`);
}

/** Узел и всё его поддерево. Сам узел идёт первым. */
export function subtreeOf<T extends TreeRow>(rows: T[], nodeId: string): T[] {
  const node = rows.find((row) => row.id === nodeId);
  if (!node) return [];
  return [node, ...rows.filter((row) => isDescendantOf(row, nodeId))];
}

/** Высота поддерева в уровнях: лист — 0, узел с детьми — 1 и так далее. */
export function subtreeHeight(rows: TreeRow[], nodeId: string): number {
  const node = rows.find((row) => row.id === nodeId);
  if (!node) return 0;
  const own = depthOf(node.path);
  return rows
    .filter((row) => isDescendantOf(row, nodeId))
    .reduce((max, row) => Math.max(max, depthOf(row.path) - own), 0);
}

export type MoveRejection =
  | 'category_not_found'
  | 'parent_not_found'
  | 'move_into_own_subtree'
  | 'max_depth_exceeded';

export interface MoveUpdate {
  id: string;
  parentId: string | null;
  path: string;
  position: number;
}

export interface MovePlan {
  updates: MoveUpdate[];
}

/**
 * Что записать в базу, чтобы `nodeId` встал под `parentId` перед `beforeId`.
 *
 * `beforeId === null` — в конец списка соседей. Возвращает либо план, либо
 * причину отказа: бросать исключения отсюда значило бы тащить в чистый
 * модуль зависимость от Nest.
 */
export function planMove(
  rows: TreeRow[],
  nodeId: string,
  parentId: string | null,
  beforeId: string | null,
): MovePlan | MoveRejection {
  const node = rows.find((row) => row.id === nodeId);
  if (!node) return 'category_not_found';

  const parent = parentId ? rows.find((row) => row.id === parentId) : null;
  if (parentId && !parent) return 'parent_not_found';

  // Узел внутрь себя или своего потомка — так дерево распадается на кольцо,
  // и поддерево вместе с материалами исчезает из обхода от корней.
  if (parent && (parent.id === nodeId || isDescendantOf(parent, nodeId))) {
    return 'move_into_own_subtree';
  }

  const targetDepth = parent ? depthOf(parent.path) + 1 : 0;
  if (targetDepth + subtreeHeight(rows, nodeId) > MAX_DEPTH) {
    return 'max_depth_exceeded';
  }

  // Префикс — это путь, который носят дети узла: до переезда и после.
  const oldPrefix = childPath(node);
  const newPath = childPath(parent ?? null);
  const newPrefix = childPath({ id: node.id, path: newPath });

  const updates: MoveUpdate[] = [];

  // Соседи по новому родителю без самого узла — в них ищем место вставки.
  const siblings = rows
    .filter((row) => row.parentId === parentId && row.id !== nodeId)
    .sort((left, right) => left.position - right.position);

  const at = beforeId
    ? siblings.findIndex((row) => row.id === beforeId)
    : siblings.length;
  const insertAt = at === -1 ? siblings.length : at;
  const ordered = [
    ...siblings.slice(0, insertAt),
    node,
    ...siblings.slice(insertAt),
  ];

  ordered.forEach((row, position) => {
    if (row.id === nodeId) {
      updates.push({ id: nodeId, parentId, path: newPath, position });
      return;
    }
    if (row.position !== position) {
      updates.push({
        id: row.id,
        parentId: row.parentId,
        path: row.path,
        position,
      });
    }
  });

  // Прежние соседи смыкаются: без этого в старом списке остаётся дыра,
  // и следующая вставка «перед третьим» промахнётся мимо места.
  if (node.parentId !== parentId) {
    rows
      .filter((row) => row.parentId === node.parentId && row.id !== nodeId)
      .sort((left, right) => left.position - right.position)
      .forEach((row, position) => {
        if (row.position !== position) {
          updates.push({
            id: row.id,
            parentId: row.parentId,
            path: row.path,
            position,
          });
        }
      });
  }

  // Поддерево едет следом: у каждого потомка меняется только тот кусок
  // пути, что описывал дорогу до переехавшего узла.
  if (oldPrefix !== newPrefix) {
    for (const row of rows) {
      if (row.id === nodeId || !isDescendantOf(row, nodeId)) continue;
      updates.push({
        id: row.id,
        parentId: row.parentId,
        path: newPrefix + row.path.slice(oldPrefix.length),
        position: row.position,
      });
    }
  }

  return { updates };
}

export function isMoveRejection(
  value: MovePlan | MoveRejection,
): value is MoveRejection {
  return typeof value === 'string';
}
