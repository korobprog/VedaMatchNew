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
 * Условие на записи для счётчика стиля (VED-165).
 *
 * `rootSlug` — выбранная вкладка витрины. Без неё чип «Киртан 12» под
 * «Традиционным» обещал двенадцать записей, а по нажатию открывалось две:
 * записи считались по всему каталогу, а выдача — уже в пределах вкладки.
 * Условие то же, что у самой выдачи (`listTracks`): корневая живёт у
 * исполнителя, поэтому это фильтр по связи `artist.rootCategory`, а не по
 * тегам записи.
 *
 * Отдельной функцией, а не строкой внутри запроса: ровно это и есть то, что
 * имеет смысл проверять тестом, — сам `groupBy` вокруг только считает строки.
 */
export function styleCountTrackFilter(
  onlyPublished: boolean,
  rootSlug: string | null,
): Record<string, unknown> {
  return {
    ...(onlyPublished ? { status: 'published' as const } : {}),
    ...(rootSlug ? { artist: { rootCategory: { slug: rootSlug } } } : {}),
  };
}

/**
 * Считает записи каждой категории — оба вида, одним обходом.
 *
 * `onlyPublished` — витрина показывает счётчик только опубликованного,
 * справочник админки — вообще всё: черновик или отклонённая запись тоже
 * занимают раздел каталога с точки зрения редакции.
 *
 * `rootSlug` сужает счётчик СТИЛЕЙ до выбранной вкладки, а счётчик корневых
 * оставляет как есть — намеренно: числа на самих вкладках отвечают на «а
 * сколько там, в другой папке», и сузить их до текущей значило бы написать
 * «Современное 0» ровно тогда, когда человек стоит на «Традиционном».
 */
export async function countTracksByCategory(
  prisma: PrismaService,
  onlyPublished: boolean,
  rootSlug: string | null = null,
): Promise<Map<string, number>> {
  // Витрина считает только записи Медиатеки: главы книг (VED-297) там не
  // показываются, и число над вкладкой не должно их обещать. Справочник
  // админки (`onlyPublished: false`) считает всё, как и раньше.
  const trackFilter = onlyPublished
    ? { status: 'published' as const, audiobookChapter: { is: null } }
    : {};

  const [styleGroups, artistsWithRoot] = await Promise.all([
    prisma.musicTrackCategory.groupBy({
      by: ['categoryId'],
      where: {
        track: styleCountTrackFilter(onlyPublished, rootSlug),
        category: { kind: 'style' },
      },
      _count: { trackId: true },
    }),
    prisma.musicArtist.findMany({
      // Чтецы раздела «Аудиокниги» (VED-237) в счётчик вкладок каталога не
      // идут: их записей в каталоге нет, и число над вкладкой обещало бы
      // список, который там не откроется.
      where: { rootCategoryId: { not: null }, isAudiobook: false },
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
