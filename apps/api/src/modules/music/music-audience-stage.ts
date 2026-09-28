import type { Prisma } from '@prisma/client';
import type { SpiritualStage } from '@vedamatch/shared';

/**
 * Поля `User`, из которых собираются «Фильтры материалов» слушателя
 * (VED-617): ручной выбор, анкета и прежний переключатель «Все ступени».
 * Портальные поля — Музыка их только читает, см. `resolveMaterialFilters`.
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
 * Условие каталога по ступеням самоидентификации (VED-575, VED-617) как
 * элементы массива `AND` — тем же приёмом, что и линия
 * (`lineageAndConditions`): у условия свой `OR` «ступени или для всех», и
 * положенный прямо в `where` он перетёр бы `OR` поиска по слову. Пустой
 * массив — фильтра нет: выбраны все ступени, человек без самоидентификации
 * или гость.
 */
export function audienceStageAndConditions(
  stages: readonly SpiritualStage[] | null,
): Prisma.MusicTrackWhereInput[] {
  if (!stages?.length) return [];
  return [
    {
      OR: [
        { audienceStages: { isEmpty: true } },
        stages.length === 1
          ? { audienceStages: { has: stages[0] } }
          : { audienceStages: { hasSome: [...stages] } },
      ],
    },
  ];
}
