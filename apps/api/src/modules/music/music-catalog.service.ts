import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LineageId,
  LineagePreference,
  MusicAlbumPageDto,
  MusicArtistPageDto,
  MusicCatalogDto,
  MusicCategoryDto,
  MusicPlaylistCardDto,
  MusicTrackDetailDto,
  MusicTrackListDto,
} from '@vedamatch/shared';
import {
  resolveContentLineage,
  toLineageId,
  toLineagePreference,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  durationCondition,
  type NormalizedMusicTrackQuery,
} from './music-catalog-query';
import {
  buildCoverUrl,
  toMusicAlbumDto,
  toMusicArtistDto,
  toMusicCategoryDto,
  toMusicTrackDetailDto,
  toMusicTrackDto,
} from './music-track-dto';

/** Сколько записей и исполнителей показывает витрина. Ровно как в мокапах. */
const SHOWCASE_FRESH = 10;
const SHOWCASE_ARTISTS = 8;
const SHOWCASE_PLAYLISTS = 4;

/**
 * `include` карточки каталога. Одной константой, чтобы выдача витрины,
 * поиска, страницы исполнителя и страницы альбома не разъезжалась в полях:
 * сборка DTO у них общая, и молчаливо недостающее поле там всплывёт как
 * `undefined`, а не как ошибка типов.
 */
const TRACK_CARD_INCLUDE = {
  artist: true,
  album: { include: { artist: true } },
  categories: { include: { category: true } },
} as const;

/**
 * Условие по линии: своя плюс записи «для всех» (`null`). Завёрнуто в
 * `AND`, а не положено в `where` как `OR`: `OR` в поиске уже занят словом
 * (название или исполнитель), и второй `OR` молча перетёр бы первый. Пустой
 * объект, когда фильтра нет.
 */
export function lineageCondition(lineage: LineageId | null) {
  return lineage ? { AND: [{ OR: [{ lineage }, { lineage: null }] }] } : {};
}

@Injectable()
export class MusicCatalogService {
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Обложки лежат открыто и раздаются напрямую; аудио — нет, оно уйдёт
    // подписанной ссылкой на этапе 2.
    this.publicBaseUrl = config.get<string>('S3_PUBLIC_URL') || undefined;
  }

  /**
   * Витрина одним запросом. Секции собираются параллельно: они не зависят
   * друг от друга, а последовательные `await` превратили бы открытие
   * страницы в сумму четырёх задержек базы.
   */
  async showcase(viewerId: string | null = null): Promise<MusicCatalogDto> {
    const lineage = await this.viewerLineage(viewerId, null);
    const [categories, fresh, artists, systemPlaylists] = await Promise.all([
      this.listCategories(),
      this.prisma.musicTrack.findMany({
        where: { status: 'published', ...lineageCondition(lineage) },
        include: TRACK_CARD_INCLUDE,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: SHOWCASE_FRESH,
      }),
      this.listShowcaseArtists(),
      this.listSystemPlaylists(),
    ]);

    return {
      categories,
      fresh: fresh.map((row) => toMusicTrackDto(row, this.publicBaseUrl)),
      artists,
      systemPlaylists,
    };
  }

  async listCategories(): Promise<MusicCategoryDto[]> {
    const categories = await this.prisma.musicCategory.findMany({
      orderBy: [{ position: 'asc' }, { title: 'asc' }],
    });

    // Счётчики одним groupBy, а не запросом на категорию: их пять, но N+1
    // здесь ничем не оправдан.
    const counts = await this.prisma.musicTrackCategory.groupBy({
      by: ['categoryId'],
      where: { track: { status: 'published' } },
      _count: { trackId: true },
    });
    const byCategory = new Map(
      counts.map((row) => [row.categoryId, row._count.trackId]),
    );

    return categories.map((row) =>
      toMusicCategoryDto(row, byCategory.get(row.id) ?? 0),
    );
  }

  private async listShowcaseArtists() {
    // Исполнители без единой опубликованной записи в витрине не нужны:
    // кружок, ведущий на пустую страницу, — обещание, которого нет.
    const artists = await this.prisma.musicArtist.findMany({
      where: { tracks: { some: { status: 'published' } } },
      include: {
        _count: { select: { tracks: { where: { status: 'published' } } } },
      },
      orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
      take: SHOWCASE_ARTISTS,
    });

    return artists.map((row) =>
      toMusicArtistDto(row, row._count.tracks, this.publicBaseUrl),
    );
  }

  /**
   * Подборки редакции. До этапа 4, где появляется работа с плейлистами,
   * список пуст — и это правильный пустой список, а не заглушка: секция
   * витрины существует, наполнять её будет админка.
   */
  private async listSystemPlaylists(): Promise<MusicPlaylistCardDto[]> {
    const playlists = await this.prisma.musicPlaylist.findMany({
      // Пустая подборка в витрине — обещание, за которым ничего нет: та же
      // причина, по которой отсюда убраны исполнители без записей.
      where: { isSystem: true, visibility: 'public', trackCount: { gt: 0 } },
      include: {
        items: { select: { track: { select: { durationSeconds: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: SHOWCASE_PLAYLISTS,
    });

    return playlists.map((row) => ({
      id: row.id,
      title: row.title,
      coverUrl: buildCoverUrl(this.publicBaseUrl, row.coverKey),
      trackCount: row.trackCount,
      totalSeconds: row.items.reduce(
        (sum, item) => sum + item.track.durationSeconds,
        0,
      ),
    }));
  }

  /**
   * Поиск и фильтры. Курсор — id последней отданной записи, а не смещение:
   * при `OFFSET` свежая публикация сдвигает страницу и человек второй раз
   * видит одно и то же.
   */
  async listTracks(
    query: NormalizedMusicTrackQuery,
    viewerId: string | null = null,
  ): Promise<MusicTrackListDto> {
    const duration = durationCondition(query.duration);
    const lineage = await this.viewerLineage(viewerId, query.lineage);

    const rows = await this.prisma.musicTrack.findMany({
      where: {
        status: 'published',
        ...lineageCondition(lineage),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' as const } },
                {
                  artist: {
                    name: { contains: query.q, mode: 'insensitive' as const },
                  },
                },
              ],
            }
          : {}),
        ...(query.category
          ? { categories: { some: { category: { slug: query.category } } } }
          : {}),
        ...(query.artist ? { artist: { slug: query.artist } } : {}),
        ...(query.language ? { language: query.language } : {}),
        ...(duration ? { durationSeconds: duration } : {}),
        ...(query.live === null ? {} : { isLiveRecording: query.live }),
      },
      include: TRACK_CARD_INCLUDE,
      orderBy: this.orderFor(query.sort),
      // Берём на одну больше запрошенного: наличие «лишней» и есть ответ на
      // вопрос, показывать ли кнопку «ещё».
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: items.map((row) => toMusicTrackDto(row, this.publicBaseUrl)),
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  /**
   * Какую линию слышит человек. Явный параметр запроса сильнее настройки
   * Музыки, та — сильнее портального профиля; правило одно на все сервисы —
   * `resolveContentLineage`. Гость и не-преданный получают весь каталог.
   *
   * Из `User` читаются ровно этап и линия — портальные поля, разрешённые
   * сервису на чтение. Пишет их портал.
   */
  private async viewerLineage(
    viewerId: string | null,
    explicit: LineagePreference,
  ): Promise<LineageId | null> {
    if (explicit) return resolveContentLineage(null, explicit);
    if (!viewerId) return null;
    const [settings, user] = await Promise.all([
      this.prisma.musicSettings.findUnique({
        where: { userId: viewerId },
        select: { lineage: true },
      }),
      this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { spiritualStage: true, lineage: true },
      }),
    ]);
    return resolveContentLineage(
      user
        ? { spiritualStage: user.spiritualStage, lineage: toLineageId(user.lineage) }
        : null,
      toLineagePreference(settings?.lineage),
    );
  }

  /**
   * Порядок выдачи. Вторым ключом всегда `id`: без него у записей с равным
   * значением порядок между страницами не определён, и курсорная страница
   * начинает терять и повторять строки.
   */
  private orderFor(sort: NormalizedMusicTrackQuery['sort']) {
    switch (sort) {
      case 'popular':
        return [{ playCount: 'desc' as const }, { id: 'desc' as const }];
      case 'title':
        return [{ title: 'asc' as const }, { id: 'desc' as const }];
      case 'duration':
        return [{ durationSeconds: 'asc' as const }, { id: 'desc' as const }];
      case 'fresh':
      default:
        return [{ publishedAt: 'desc' as const }, { id: 'desc' as const }];
    }
  }

  /**
   * Карточка записи. Неопубликованную видит только тот, кто её загрузил, и
   * админ сервиса: до разбора модератором запись слышит один автор.
   */
  async getTrack(
    id: string,
    viewerId: string | null,
    viewerIsAdmin: boolean,
  ): Promise<MusicTrackDetailDto> {
    const track = await this.prisma.musicTrack.findUnique({
      where: { id },
      include: TRACK_CARD_INCLUDE,
    });

    if (!track) throw new NotFoundException('Запись не найдена');

    const visible =
      track.status === 'published' ||
      viewerIsAdmin ||
      (viewerId !== null && track.uploadedById === viewerId);

    // 404, а не 403: существование чужого черновика — тоже сведения о нём.
    if (!visible) throw new NotFoundException('Запись не найдена');

    return toMusicTrackDetailDto(track, this.publicBaseUrl);
  }

  async getArtist(slug: string): Promise<MusicArtistPageDto> {
    const artist = await this.prisma.musicArtist.findUnique({
      where: { slug },
      include: {
        _count: { select: { tracks: { where: { status: 'published' } } } },
      },
    });

    if (!artist) throw new NotFoundException('Исполнитель не найден');

    const [albums, tracks] = await Promise.all([
      this.prisma.musicAlbum.findMany({
        // Альбом без единой опубликованной записи не показываем по той же
        // причине, что и исполнителя без записей в витрине: карточка ведёт
        // на пустую страницу, то есть врёт о содержимом.
        where: {
          artistId: artist.id,
          tracks: { some: { status: 'published' } },
        },
        include: {
          artist: true,
          _count: { select: { tracks: { where: { status: 'published' } } } },
        },
        orderBy: [{ year: 'desc' }, { title: 'asc' }],
      }),
      this.prisma.musicTrack.findMany({
        where: { artistId: artist.id, status: 'published' },
        include: TRACK_CARD_INCLUDE,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    return {
      artist: toMusicArtistDto(
        artist,
        artist._count.tracks,
        this.publicBaseUrl,
      ),
      albums: albums.map((row) =>
        toMusicAlbumDto(row, row._count.tracks, this.publicBaseUrl),
      ),
      tracks: tracks.map((row) => toMusicTrackDto(row, this.publicBaseUrl)),
    };
  }

  async getAlbum(slug: string): Promise<MusicAlbumPageDto> {
    const album = await this.prisma.musicAlbum.findUnique({
      where: { slug },
      include: {
        artist: true,
        _count: { select: { tracks: { where: { status: 'published' } } } },
      },
    });

    if (!album) throw new NotFoundException('Альбом не найден');

    const tracks = await this.prisma.musicTrack.findMany({
      where: { albumId: album.id, status: 'published' },
      include: TRACK_CARD_INCLUDE,
      // Программа слушается в порядке записи, а не свежести.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      album: toMusicAlbumDto(album, album._count.tracks, this.publicBaseUrl),
      tracks: tracks.map((row) => toMusicTrackDto(row, this.publicBaseUrl)),
    };
  }
}
