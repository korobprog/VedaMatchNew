import type { Prisma } from '@prisma/client';
import type { SpiritualStage } from '@vedamatch/shared';

/**
 * Условие ленты по ступени самоидентификации (VED-575): материалы этой
 * ступени плюс материалы «для всех» (пустая разметка). `null` — фильтра нет:
 * человек без самоидентификации или выбравший на главной «Все ступени».
 * Кто зритель — решает общая `resolveAudienceStage` из `@vedamatch/shared`,
 * условие Prisma — своё у Образования.
 */
export function audienceStageCondition(
  stage: SpiritualStage | null,
): Prisma.LibraryEntryWhereInput | null {
  if (!stage) return null;
  return {
    OR: [
      { audienceStages: { isEmpty: true } },
      { audienceStages: { has: stage } },
    ],
  };
}
