import type { Prisma } from '@prisma/client';
import type { WorkArchiveView } from '@vedamatch/shared';

/**
 * Архив доски (VED-61): что показать на вкладках «Выполненные» и
 * «Убранные».
 *
 * До архива выполненное жило в колонке с галочкой и копилось там месяцами, а
 * убранная кнопкой «в архив» карточка пропадала бесследно — ни увидеть, ни
 * вернуть. Чистая часть — здесь, запрос к базе — в `WorkBoardsService`.
 */

/** Сколько карточек отдаём за раз: свежие первыми, дальше — «показаны не все». */
export const WORK_ARCHIVE_LIMIT = 200;

/** Неизвестное значение — «Выполненные»: за ними в архив и приходят. */
export function parseArchiveView(raw: unknown): WorkArchiveView {
  return raw === 'removed' ? 'removed' : 'done';
}

export function archiveWhere(
  boardId: string,
  view: WorkArchiveView,
): Prisma.WorkTaskWhereInput {
  return view === 'removed'
    ? { boardId, archivedAt: { not: null } }
    : // Выполненные — все закрытые, в том числе уже убранные с доски: они
      // тоже сделаны, и искать их по двум вкладкам незачем.
      { boardId, completedAt: { not: null } };
}

export function archiveOrderBy(
  view: WorkArchiveView,
): Prisma.WorkTaskOrderByWithRelationInput[] {
  return view === 'removed'
    ? [{ archivedAt: 'desc' }, { number: 'desc' }]
    : [{ completedAt: 'desc' }, { number: 'desc' }];
}
