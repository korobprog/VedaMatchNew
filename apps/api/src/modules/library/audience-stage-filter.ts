import type { Prisma } from '@prisma/client';
import type { SpiritualStage } from '@vedamatch/shared';

/**
 * Поля `User`, из которых собираются «Фильтры материалов» зрителя (VED-617):
 * ручной выбор, анкета и прежний переключатель «Все ступени». Портальные
 * поля — сервис их только читает, см. `resolveMaterialFilters`.
 */
export const MATERIAL_FILTERS_SELECT = {
  spiritualStage: true,
  lineage: true,
  showAllStages: true,
  materialFiltersSetAt: true,
  materialStages: true,
  materialLineages: true,
} as const satisfies Prisma.UserSelect;

/**
 * Условие ленты по ступеням самоидентификации (VED-575, VED-617): материалы
 * любой из выбранных ступеней плюс материалы «для всех» (пустая разметка).
 * `null` — фильтра нет: выбраны все ступени, человек без самоидентификации
 * или гость. Какие ступени — решает общая `resolveMaterialFilters` из
 * `@vedamatch/shared`, условие Prisma — своё у Образования.
 */
export function audienceStageCondition(
  stages: readonly SpiritualStage[] | null,
): Prisma.LibraryEntryWhereInput | null {
  if (!stages?.length) return null;
  return {
    OR: [
      { audienceStages: { isEmpty: true } },
      stages.length === 1
        ? { audienceStages: { has: stages[0] } }
        : { audienceStages: { hasSome: [...stages] } },
    ],
  };
}
