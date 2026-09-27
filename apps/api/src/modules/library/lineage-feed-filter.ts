import type { Prisma } from '@prisma/client';
import { lineageFilterIds, type LineageFilterValue } from '@vedamatch/shared';

/**
 * Условие ленты по линии: сама линия (или любая линия группы —
 * `group:gaudiya_math`, VED-568) плюс материалы «для всех» (`null`).
 * `null` — фильтра нет. Разбор значения общий (`lineageFilterIds` из
 * `@vedamatch/shared`), а условие Prisma — своё у Образования.
 */
export function lineageFeedCondition(
  filter: LineageFilterValue | null,
): Prisma.LibraryEntryWhereInput | null {
  const ids = lineageFilterIds(filter);
  if (!ids) return null;
  const match: Prisma.LibraryEntryWhereInput =
    ids.length === 1 ? { lineage: ids[0] } : { lineage: { in: ids } };
  return { OR: [match, { lineage: null }] };
}
