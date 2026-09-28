import type { Prisma } from '@prisma/client';
import type { LineageId } from '@vedamatch/shared';

/**
 * Условие ленты по линиям: любая из выбранных (одна линия, группа —
 * VED-568 — или несколько из «Фильтров материалов», VED-617) плюс материалы
 * «для всех» (`null`). `null` — фильтра нет. Какие линии — решает общая
 * `effectiveLineageIds` из `@vedamatch/shared`, условие Prisma — своё у
 * Образования.
 */
export function lineageFeedCondition(
  ids: readonly LineageId[] | null,
): Prisma.LibraryEntryWhereInput | null {
  if (!ids?.length) return null;
  const match: Prisma.LibraryEntryWhereInput =
    ids.length === 1 ? { lineage: ids[0] } : { lineage: { in: [...ids] } };
  return { OR: [match, { lineage: null }] };
}
