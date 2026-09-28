import type { Prisma } from '@prisma/client';
import type { SpiritualStage } from '@vedamatch/shared';

/**
 * Условие каталога по ступени самоидентификации (VED-575) как элементы
 * массива `AND` — тем же приёмом, что и линия (`lineageAndConditions`):
 * у условия свой `OR` «ступень или для всех», и положенный прямо в `where`
 * он перетёр бы `OR` поиска по слову. Пустой массив — фильтра нет: человек
 * без самоидентификации или выбравший на главной «Все ступени».
 */
export function audienceStageAndConditions(
  stage: SpiritualStage | null,
): Prisma.MusicTrackWhereInput[] {
  if (!stage) return [];
  return [
    {
      OR: [
        { audienceStages: { isEmpty: true } },
        { audienceStages: { has: stage } },
      ],
    },
  ];
}
