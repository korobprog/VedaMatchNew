import type { Prisma } from '@prisma/client';
import { isLineageId, type LineageId } from '@vedamatch/shared';

/**
 * Линия из тела запроса админки (VED-548, VED-561): идентификатор из
 * справочника или `null`. Всё прочее — `undefined`, и сервис отвечает 400.
 * Отсутствие поля — тоже ошибка: у этих маршрутов линия — единственное, что
 * они меняют, и молча ничего не сделать хуже, чем сказать об ошибке.
 */
export function parseLineageInput(body: unknown): LineageId | null | undefined {
  if (!body || typeof body !== 'object' || !('lineage' in body)) {
    return undefined;
  }
  const value = body.lineage;
  if (value === null) return null;
  return isLineageId(value) ? value : undefined;
}

/**
 * Рубрики автора: сама рубрика и всё её поддерево. Потомка выдаёт
 * материализованный путь — id рубрики стоит в нём между точками.
 */
export function authorSubtreeWhere(
  categoryId: string,
): Prisma.LibraryCategoryWhereInput {
  return {
    OR: [{ id: categoryId }, { path: { contains: `.${categoryId}.` } }],
  };
}

/**
 * Материалы автора, которым линию ещё надо проставить: лежат хотя бы в
 * одной рубрике поддерева и подписаны иначе. `lineage: { not }` в Postgres
 * отбрасывает `NULL`, поэтому «для всех линий» перечислено отдельно — иначе
 * такие материалы остались бы нетронутыми.
 */
export function authorEntriesWhere(
  categoryIds: readonly string[],
  lineage: LineageId,
): Prisma.LibraryEntryWhereInput {
  return {
    categories: { some: { categoryId: { in: [...categoryIds] } } },
    OR: [{ lineage: null }, { lineage: { not: lineage } }],
  };
}
