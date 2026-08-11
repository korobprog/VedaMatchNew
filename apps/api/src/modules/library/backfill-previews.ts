/*
 * Обложки для ссылок, добавленных до появления превью.
 *
 * Локально: pnpm --filter @vedamatch/api library:previews [--dry-run] [--limit=N]
 * В контейнере: node dist/modules/library/backfill-previews.js [--dry-run]
 *
 * Файл лежит в src, а не в scripts/, именно чтобы попадать в dist: в рантайм-образ
 * копируется только dist и прод-зависимости, ts-node там нет.
 *
 * Берём записи без своей копии в S3 (previewKey пуст) — в том числе те, у
 * которых уже стоит адрес чужого CDN. Идём порциями и по одной ссылке за раз:
 * это скачивание и сжатие картинок, распараллеливать их незачем.
 */
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { LibraryPreviewsService } from './library-previews.service';
import { resolvePreviewUrl } from './preview-url';

const BATCH_SIZE = 200;

export async function backfillPreviews(argv: string[] = []) {
  const prisma = new PrismaClient();
  const previews = new LibraryPreviewsService(
    prisma as never,
    new ConfigService(),
  );
  const dryRun = argv.includes('--dry-run');
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

  if (!previews.configured) {
    console.warn(
      'S3 не настроен — обложки будут записаны ссылками на источник, без своей копии',
    );
  }

  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;

  try {
    for (;;) {
      const entries = await prisma.libraryEntry.findMany({
        where: { previewKey: null },
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

        const remote = await resolvePreviewUrl(entry.url);
        if (!remote) continue;

        updated += 1;
        console.log(`${dryRun ? '[dry-run] ' : ''}${entry.url} → ${remote}`);
        if (dryRun) continue;

        if (previews.configured) {
          await previews.capture(entry.id, entry.url, remote);
          continue;
        }
        await prisma.libraryEntry.update({
          where: { id: entry.id },
          data: { previewUrl: remote },
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
