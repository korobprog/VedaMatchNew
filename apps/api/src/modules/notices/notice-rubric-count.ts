import type { Prisma, PrismaClient } from '@prisma/client';

type Db =
  Pick<PrismaClient, 'notice' | 'noticeRubric'> | Prisma.TransactionClient;

/**
 * Счётчик рубрики пересчитывается запросом, а не инкрементом: публикация,
 * скрытие (в том числе по жалобе), протухание и удаление меняют его в разные
 * стороны, и рассинхрон инкрементов видно в навигации сразу. Общий хелпер,
 * чтобы NoticesService и NoticesReportsService считали одинаково.
 */
export async function recountRubric(
  db: Db,
  rubricId: string,
  now = new Date(),
): Promise<void> {
  const noticesCount = await db.notice.count({
    where: { rubricId, status: 'published', expiresAt: { gt: now } },
  });
  await db.noticeRubric.update({
    where: { id: rubricId },
    data: { noticesCount },
  });
}

/** То же, но по id объявления — когда рубрика на руках не нужна. */
export async function recountRubricOfNotice(
  db: Db,
  noticeId: string,
  now = new Date(),
): Promise<void> {
  const notice = await db.notice.findUnique({
    where: { id: noticeId },
    select: { rubricId: true },
  });
  if (notice) await recountRubric(db, notice.rubricId, now);
}
