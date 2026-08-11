/*
 * Обложки для ссылок, добавленных до появления превью.
 *
 * Локально: pnpm --filter @vedamatch/api library:previews [--dry-run] [--limit=N]
 * В контейнере: node dist/modules/library/backfill-previews.js [--dry-run]
 *
 * Файл лежит в src, а не в scripts/, именно чтобы попадать в dist: в рантайм-образ
 * копируется только dist и прод-зависимости, ts-node там нет.
 *
 * Идём порциями и по одной ссылке за раз: Rutube отвечает через oEmbed,
 * и заваливать его параллельными запросами незачем. YouTube сетевых
 * обращений вообще не требует — обложка выводится из адреса.
 */
import { PrismaClient } from '@prisma/client';
import { resolvePreviewUrl } from './preview-url';

const BATCH_SIZE = 200;

export async function backfillPreviews(argv: string[] = []) {
  const prisma = new PrismaClient();
  const dryRun = argv.includes('--dry-run');
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;

  try {
    for (;;) {
      const entries = await prisma.libraryEntry.findMany({
        where: { previewUrl: null },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, url: true },
      });
      if (entries.length === 0) break;
      cursor = entries.at(-1)?.id;

      for (const entry of entries) {
        if (scanned >= limit) break;
        scanned += 1;

        const previewUrl = await resolvePreviewUrl(entry.url);
        if (!previewUrl) continue;

        updated += 1;
        console.log(
          `${dryRun ? '[dry-run] ' : ''}${entry.url} → ${previewUrl}`,
        );
        if (dryRun) continue;
        await prisma.libraryEntry.update({
          where: { id: entry.id },
          data: { previewUrl },
        });
      }

      if (scanned >= limit) break;
    }

    console.log(
      `Просмотрено ссылок без обложки: ${scanned}, обложек найдено: ${updated}` +
        (dryRun ? ' (изменения не сохранялись)' : ''),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  backfillPreviews(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
