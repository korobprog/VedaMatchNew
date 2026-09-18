import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Сколько записей у каждой категории каталога (VED-165-2).
 *
 * До этой правки счётчик считался одним `groupBy` по `MusicTrackCategory` —
 * годилось, пока оба вида категории (корневая и стиль) были тегом записи.
 * Теперь корневую ставят исполнителю (`MusicArtist.rootCategoryId`), а не
 * записи: прежний `groupBy` продолжал бы честно считать связи
 * `MusicTrackCategory` с корневой категорией, только таких связей больше не
 * заводится, и счётчик навсегда показывал бы ноль даже у размеченного
 * каталога. Стиль остаётся прямым тегом записи и считается как раньше.
 */

/** Строка агрегата по стилю — то, что возвращает `musicTrackCategory.groupBy`. */
export interface StyleCategoryCount {
  categoryId: string;
  count: number;
}

/** Строка агрегата по корневой — записи считаются через исполнителя. */
export interface RootArtistCount {
  rootCategoryId: string;
  trackCount: number;
}

/**
 * Сводит оба источника в одну карту `categoryId → число записей`.
 *
 * Раздельные источники, а не один общий запрос: `groupBy` у Prisma не умеет
 * группировать по полю связанной модели, а корневая теперь живёт на
 * исполнителе. Множества id не пересекаются — категория либо стиль, либо
 * корневая, — так что порядок слияния роли не играет.
 */
export function mergeCategoryCounts(
  styleCounts: StyleCategoryCount[],
  rootCounts: RootArtistCount[],
): Map<string, number> {
  const byId = new Map<string, number>();
  for (const row of styleCounts) {
    byId.set(row.categoryId, row.count);
  }
  for (const row of rootCounts) {
    byId.set(
      row.rootCategoryId,
      (byId.get(row.rootCategoryId) ?? 0) + row.trackCount,
    );
  }
  return byId;
}

/**
 * Считает записи каждой категории — оба вида, одним обходом.
 *
 * `onlyPublished` — витрина показывает счётчик только опубликованного,
 * справочник админки — вообще всё: черновик или отклонённая запись тоже
 * занимают раздел каталога с точки зрения редакции.
 */
export async function countTracksByCategory(
  prisma: PrismaService,
  onlyPublished: boolean,
): Promise<Map<string, number>> {
  const trackFilter = onlyPublished ? { status: 'published' as const } : {};

  const [styleGroups, artistsWithRoot] = await Promise.all([
    prisma.musicTrackCategory.groupBy({
      by: ['categoryId'],
      where: { track: trackFilter, category: { kind: 'style' } },
      _count: { trackId: true },
    }),
    prisma.musicArtist.findMany({
      where: { rootCategoryId: { not: null } },
      select: {
        rootCategoryId: true,
        _count: { select: { tracks: { where: trackFilter } } },
      },
    }),
  ]);

  return mergeCategoryCounts(
    styleGroups.map((row) => ({
      categoryId: row.categoryId,
      count: row._count.trackId,
    })),
    artistsWithRoot
      .filter(
        (row): row is typeof row & { rootCategoryId: string } =>
          row.rootCategoryId !== null,
      )
      .map((row) => ({
        rootCategoryId: row.rootCategoryId,
        trackCount: row._count.tracks,
      })),
  );
}
