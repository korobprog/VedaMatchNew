import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  MusicAdminAlbumsDto,
  MusicAdminArtistsDto,
  MusicAdminCategoriesDto,
  MusicAdminSummaryDto,
  MusicAdminTracksDto,
  MusicModerationDecisionRequest,
  MusicModerationItemDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toMusicAlbumDto,
  toMusicArtistDto,
  toMusicCategoryDto,
  toMusicTrackDetailDto,
} from './music-track-dto';

const MAX_NOTE_LENGTH = 500;
const QUEUE_PAGE = 50;
/**
 * Сколько записей отдаёт список каталога за раз. Больше на экран всё равно
 * не помещается, а грузить весь бакет ради страницы справочников незачем.
 */
const TRACKS_PAGE = 200;

/**
 * Очередь модерации и сводка раздела.
 *
 * Отдельно от `MusicAdminCatalogService`: тот заводит справочники, этот
 * принимает решения по записям. Разные вопросы и разная цена ошибки —
 * опечатка в имени исполнителя правится, снятая по копирайту запись нет.
 *
 * Имена здесь **мирские**, а не `resolveDisplayName()`: это раздел
 * модерации, и по духовному имени нельзя понять, кто перед тобой. То же
 * исключение, что у админки и поддержки в контракте.
 */
@Injectable()
export class MusicAdminQueueService {
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.publicBaseUrl = config.get<string>('S3_PUBLIC_URL') || undefined;
  }

  private assertAdmin(viewerIsAdmin: boolean): void {
    if (!viewerIsAdmin) {
      throw new ForbiddenException('Доступ только для администратора сервиса');
    }
  }

  async summary(viewerIsAdmin: boolean): Promise<MusicAdminSummaryDto> {
    this.assertAdmin(viewerIsAdmin);

    const [
      pending,
      published,
      hidden,
      artists,
      albums,
      categories,
      openReports,
      stored,
    ] = await Promise.all([
      this.prisma.musicTrack.count({ where: { status: 'pending' } }),
      this.prisma.musicTrack.count({ where: { status: 'published' } }),
      this.prisma.musicTrack.count({ where: { status: 'hidden' } }),
      this.prisma.musicArtist.count(),
      this.prisma.musicAlbum.count(),
      this.prisma.musicCategory.count(),
      this.prisma.musicReport.count({ where: { status: 'open' } }),
      this.prisma.musicTrack.aggregate({ _sum: { sizeBytes: true } }),
    ]);

    return {
      pending,
      published,
      hidden,
      artists,
      albums,
      categories,
      openReports,
      storedBytes: stored._sum.sizeBytes ?? 0,
    };
  }

  /**
   * Очередь. Сначала то, что дольше ждёт: у модерации аудио порядок «кто
   * раньше пришёл» единственно честный — правообладатель приходит быстрее
   * модератора, и держать чью-то запись в конце списка неделю нельзя.
   */
  async queue(viewerIsAdmin: boolean): Promise<MusicModerationItemDto[]> {
    this.assertAdmin(viewerIsAdmin);

    const tracks = await this.prisma.musicTrack.findMany({
      where: { status: 'pending' },
      include: {
        artist: true,
        album: { include: { artist: true } },
        categories: { include: { category: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: QUEUE_PAGE,
    });

    // Основание прав живёт на загрузке. Достаём одним запросом по ключам, а
    // не по строке на запись: очередь на полсотни позиций иначе даёт полсотни
    // походов в базу.
    const uploads = await this.prisma.musicUpload.findMany({
      where: { storageKey: { in: tracks.map((track) => track.storageKey) } },
      select: { storageKey: true, rightsBasis: true, createdAt: true },
    });
    const byKey = new Map(uploads.map((row) => [row.storageKey, row]));

    return tracks.map((track) => {
      const upload = byKey.get(track.storageKey);
      return {
        track: toMusicTrackDetailDto(track, this.publicBaseUrl),
        uploader: track.uploadedBy
          ? { id: track.uploadedBy.id, name: track.uploadedBy.name }
          : null,
        rightsBasis: upload?.rightsBasis ?? null,
        uploadedAt: upload?.createdAt.toISOString() ?? null,
      };
    });
  }

  /**
   * Решение по записи.
   *
   * Отказ и скрытие требуют причины: человек увидит её в своих загрузках, а
   * «отклонено» без слов — это гарантированная повторная заливка того же
   * файла. Публикация причины не требует, но принимает: «поправил исполнителя»
   * тоже полезно сохранить.
   */
  async decide(
    viewerIsAdmin: boolean,
    trackId: string,
    body: MusicModerationDecisionRequest,
  ) {
    this.assertAdmin(viewerIsAdmin);

    const track = await this.prisma.musicTrack.findUnique({
      where: { id: trackId },
      select: { id: true, publishedAt: true, title: true, uploadedById: true },
    });
    if (!track) throw new NotFoundException('Запись не найдена');

    const note = body.note?.trim().slice(0, MAX_NOTE_LENGTH) || null;
    if (body.decision !== 'publish' && !note) {
      throw new BadRequestException('Укажите причину решения');
    }

    const status =
      body.decision === 'publish'
        ? ('published' as const)
        : body.decision === 'reject'
          ? ('rejected' as const)
          : ('hidden' as const);

    const updated = await this.prisma.musicTrack.update({
      where: { id: trackId },
      data: {
        status,
        moderationNote: note,
        // Дата публикации ставится один раз: возврат снятой записи не должен
        // поднимать её в «Новом» как свежую.
        ...(status === 'published' && track.publishedAt === null
          ? { publishedAt: new Date() }
          : {}),
      },
    });

    // Решение редакции — то, ради чего человек и ждал. Молчание здесь
    // превращает проверку в чёрный ящик.
    if (track.uploadedById) {
      // `name` дублируется в нагрузке: подписчик получает один аргумент и по
      // нему выбирает формулировку, имя события до него не доходит.
      const base = {
        recipientId: track.uploadedById,
        trackId: track.id,
        title: track.title,
      };
      if (status === 'published') {
        this.events.emit('music.track.published', {
          name: 'music.track.published',
          ...base,
        });
      } else {
        this.events.emit('music.track.rejected', {
          name: 'music.track.rejected',
          ...base,
          reason: note!,
        });
      }
    }

    return updated;
  }

  // ---------- Справочники для форм админки ----------

  async listArtists(viewerIsAdmin: boolean): Promise<MusicAdminArtistsDto> {
    this.assertAdmin(viewerIsAdmin);
    const rows = await this.prisma.musicArtist.findMany({
      include: { _count: { select: { tracks: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      items: rows.map((row) =>
        toMusicArtistDto(row, row._count.tracks, this.publicBaseUrl),
      ),
    };
  }

  async listAlbums(viewerIsAdmin: boolean): Promise<MusicAdminAlbumsDto> {
    this.assertAdmin(viewerIsAdmin);
    const rows = await this.prisma.musicAlbum.findMany({
      include: { artist: true, _count: { select: { tracks: true } } },
      orderBy: [{ year: 'desc' }, { title: 'asc' }],
    });
    return {
      items: rows.map((row) =>
        toMusicAlbumDto(row, row._count.tracks, this.publicBaseUrl),
      ),
    };
  }

  /**
   * Все записи каталога — то, чего в админке не было: очередь показывает
   * только `pending`, и опубликованную или отклонённую запись после решения
   * увидеть было негде, а значит и убрать нечем.
   *
   * Порядок «свежие сверху»: убирают обычно то, что только что залили не
   * туда. Статус в строке обязателен — по названию не отличить снятое от
   * живого.
   */
  async listTracks(viewerIsAdmin: boolean): Promise<MusicAdminTracksDto> {
    this.assertAdmin(viewerIsAdmin);

    const [rows, total] = await Promise.all([
      this.prisma.musicTrack.findMany({
        include: { artist: true, album: true },
        orderBy: { createdAt: 'desc' },
        take: TRACKS_PAGE,
      }),
      this.prisma.musicTrack.count(),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        artistName: row.artist?.name ?? null,
        albumTitle: row.album?.title ?? null,
        durationSeconds: row.durationSeconds,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt.toISOString(),
        publishedAt: row.publishedAt?.toISOString() ?? null,
      })),
      total,
    };
  }

  async listCategories(
    viewerIsAdmin: boolean,
  ): Promise<MusicAdminCategoriesDto> {
    this.assertAdmin(viewerIsAdmin);
    const rows = await this.prisma.musicCategory.findMany({
      include: { _count: { select: { tracks: true } } },
      orderBy: [{ position: 'asc' }, { title: 'asc' }],
    });
    return {
      items: rows.map((row) => toMusicCategoryDto(row, row._count.tracks)),
    };
  }
}
