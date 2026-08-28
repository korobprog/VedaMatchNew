import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PORTAL_ACTIVITY_EVENTS,
  type CreateMusicPlaylistRequest,
  type MusicPlaylistDto,
  type MusicPlaylistPageDto,
  type MusicPlaylistPickDto,
  type MusicPlaylistTrackResultDto,
  type PortalActivityEvent,
  type UpdateMusicPlaylistRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MusicCoversService } from './music-covers.service';
import { mayShareMusicActivity } from './music-activity-share';
import { toMusicTrackDto } from './music-track-dto';
import { nextPosition, positionForMove, renumber } from './playlist-order';

/** Сколько плейлистов у человека имеет смысл: дальше это не список, а свалка. */
const MAX_PLAYLISTS_PER_USER = 100;

/** Потолок записей в одном плейлисте. */
const MAX_ITEMS_PER_PLAYLIST = 500;

/**
 * `include` карточки записи. Копия константы из `music-catalog.service.ts`:
 * сборщик DTO у них общий, и недостающее поле всплыло бы на странице
 * плейлиста как `undefined`, а не как ошибка типов.
 */
const TRACK_CARD_INCLUDE = {
  artist: true,
  album: { include: { artist: true } },
  categories: { include: { category: true } },
} as const;

const PLAYLIST_SELECT = {
  id: true,
  title: true,
  description: true,
  coverKey: true,
  visibility: true,
  trackCount: true,
  isSystem: true,
  updatedAt: true,
} as const;

/**
 * Плейлисты человека. См. docs/music-service-plan.md, этап 4.
 *
 * Подборки редакции (`isSystem`) живут в тех же таблицах, но правит их
 * только админка: здесь они видны в чтении и отбиваются на любой записи.
 *
 * Порядок записей — разрежёнными позициями из `playlist-order.ts`, чтобы
 * вставка в середину не переписывала весь хвост.
 */
@Injectable()
export class MusicPlaylistsService {
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventEmitter2,
    private readonly covers: MusicCoversService,
    config: ConfigService,
  ) {
    this.publicBaseUrl = config.get<string>('S3_PUBLIC_URL') || undefined;
  }

  /**
   * Часть `data` с обложкой — или пустая, когда о ней не говорили.
   *
   * Владелец здесь обязателен, в отличие от каталога: плейлист правит кто
   * угодно, и без сверки человек присылает чужой ключ и ставит себе чужую
   * картинку, ни разу ничего не залив.
   */
  private coverPatch(
    userId: string,
    next: string | null | undefined,
    current: string | null,
  ): { coverKey?: string | null } {
    const value = this.covers.resolveKey({
      next,
      current,
      scope: 'playlist',
      ownerId: userId,
    });
    return value === undefined ? {} : { coverKey: value };
  }

  /** Свои плейлисты, свежие сверху. */
  async list(userId: string): Promise<{ items: MusicPlaylistDto[] }> {
    const rows = await this.prisma.musicPlaylist.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      take: MAX_PLAYLISTS_PER_USER,
      select: PLAYLIST_SELECT,
    });

    const totals = await this.totalsOf(rows.map((row) => row.id));
    return { items: rows.map((row) => this.toDto(row, totals)) };
  }

  /**
   * Список для шторки «В плейлист»: те же плейлисты плюс признак, что запись
   * уже лежит внутри. Одним запросом на все плейлисты сразу, а не по одному
   * на строку.
   */
  async listForPicker(
    userId: string,
    trackId: string,
  ): Promise<{ items: MusicPlaylistPickDto[] }> {
    const { items } = await this.list(userId);
    if (items.length === 0) return { items: [] };

    const present = await this.prisma.musicPlaylistItem.findMany({
      where: { trackId, playlistId: { in: items.map((item) => item.id) } },
      select: { playlistId: true },
    });
    const inside = new Set(present.map((row) => row.playlistId));

    return {
      items: items.map((item) => ({
        ...item,
        containsTrack: inside.has(item.id),
      })),
    };
  }

  async create(
    userId: string,
    body: CreateMusicPlaylistRequest,
  ): Promise<MusicPlaylistDto> {
    const title = (body.title ?? '').trim();
    if (!title) throw new ForbiddenException('Название не может быть пустым');

    const count = await this.prisma.musicPlaylist.count({
      where: { ownerId: userId },
    });
    if (count >= MAX_PLAYLISTS_PER_USER) {
      throw new ForbiddenException(
        `Больше ${MAX_PLAYLISTS_PER_USER} плейлистов — это уже не список`,
      );
    }

    const row = await this.prisma.musicPlaylist.create({
      data: {
        ownerId: userId,
        title: title.slice(0, 120),
        description: body.description?.trim().slice(0, 500) || null,
        visibility: body.visibility ?? 'private',
        ...this.coverPatch(userId, body.coverKey, null),
      },
      select: PLAYLIST_SELECT,
    });
    return this.toDto(row, new Map());
  }

  async update(
    userId: string,
    id: string,
    body: UpdateMusicPlaylistRequest,
  ): Promise<MusicPlaylistDto> {
    await this.own(userId, id);

    // Запоминаем видимость до правки: в ленту идёт переход «был закрытым —
    // стал открытым», а не каждое сохранение открытого плейлиста. Иначе
    // переименование показывалось бы друзьям как новый плейлист.
    const before = await this.prisma.musicPlaylist.findUnique({
      where: { id },
      select: { visibility: true, coverKey: true },
    });

    const title = body.title?.trim();
    const row = await this.prisma.musicPlaylist.update({
      where: { id },
      data: {
        ...this.coverPatch(userId, body.coverKey, before?.coverKey ?? null),
        ...(title ? { title: title.slice(0, 120) } : {}),
        ...(body.description !== undefined
          ? { description: body.description?.trim().slice(0, 500) || null }
          : {}),
        ...(body.visibility ? { visibility: body.visibility } : {}),
      },
      select: PLAYLIST_SELECT,
    });

    if (before?.visibility === 'private' && row.visibility !== 'private') {
      await this.announcePublished(
        userId,
        row.id,
        row.title,
        row.visibility === 'public',
      );
    }

    const totals = await this.totalsOf([id]);
    return this.toDto(row, totals);
  }

  /**
   * Факт для ленты друзей: человек открыл свой плейлист. Событие
   * самодостаточно — подписчик не имеет права дочитывать название из таблиц
   * Музыки.
   *
   * Ссылка ставится только у публичного плейлиста. У `friends` страница
   * чужому не открывается: граф доступа принадлежит модулю `activity`, и
   * проверить «этот зритель — друг» в Музыке нечем. Ссылка в 404 хуже
   * карточки без ссылки, поэтому её здесь просто нет.
   */
  private async announcePublished(
    userId: string,
    playlistId: string,
    title: string,
    isPublic: boolean,
  ): Promise<void> {
    const settings = await this.prisma.musicSettings.findUnique({
      where: { userId },
      select: { nowPlayingVisibility: true },
    });
    if (!mayShareMusicActivity(settings?.nowPlayingVisibility)) return;

    const event: PortalActivityEvent = {
      name: PORTAL_ACTIVITY_EVENTS.music,
      userId,
      action: 'music.playlist-published',
      occurredAt: new Date().toISOString(),
      entityId: playlistId,
      entityLabel: title,
      ...(isPublic ? { link: `/music/playlists/${playlistId}` } : {}),
    };
    this.bus.emit(event.name, event);
  }

  async remove(userId: string, id: string): Promise<{ removed: true }> {
    await this.own(userId, id);
    // Записи уходят каскадом по FK, отдельной чистки не нужно.
    await this.prisma.musicPlaylist.delete({ where: { id } });
    return { removed: true };
  }

  /**
   * Добавление идемпотентно: галочку в шторке нажимают дважды, и ошибка в
   * ответ на это — худшее, что может сделать интерфейс.
   */
  async addTrack(
    userId: string,
    playlistId: string,
    trackId: string,
  ): Promise<MusicPlaylistTrackResultDto> {
    await this.own(userId, playlistId);

    const track = await this.prisma.musicTrack.findUnique({
      where: { id: trackId },
      select: { id: true, status: true, uploadedById: true },
    });
    // 404 и на «нет записи», и на «не для вас»: иначе по коду ответа
    // перебираются чужие черновики — та же логика, что в избранном.
    const allowed =
      track && (track.status === 'published' || track.uploadedById === userId);
    if (!allowed) throw new NotFoundException('Запись не найдена');

    const existing = await this.prisma.musicPlaylistItem.findUnique({
      where: { playlistId_trackId: { playlistId, trackId } },
      select: { id: true },
    });
    if (existing) {
      const count = await this.count(playlistId);
      return { playlistId, trackId, containsTrack: true, trackCount: count };
    }

    const count = await this.count(playlistId);
    if (count >= MAX_ITEMS_PER_PLAYLIST) {
      throw new ForbiddenException(
        `В плейлисте уже ${MAX_ITEMS_PER_PLAYLIST} записей`,
      );
    }

    const last = await this.prisma.musicPlaylistItem.findFirst({
      where: { playlistId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    await this.prisma.$transaction([
      this.prisma.musicPlaylistItem.create({
        data: {
          playlistId,
          trackId,
          position: nextPosition(last?.position ?? null),
        },
      }),
      this.prisma.musicPlaylist.update({
        where: { id: playlistId },
        data: { trackCount: { increment: 1 } },
      }),
    ]);

    return {
      playlistId,
      trackId,
      containsTrack: true,
      trackCount: count + 1,
    };
  }

  /**
   * Снятие не проверяет запись: её могли убрать из каталога, а строка в
   * плейлисте осталась. Требовать существующую значит не дать прибраться.
   */
  async removeTrack(
    userId: string,
    playlistId: string,
    trackId: string,
  ): Promise<MusicPlaylistTrackResultDto> {
    await this.own(userId, playlistId);

    const { count: deleted } = await this.prisma.musicPlaylistItem.deleteMany({
      where: { playlistId, trackId },
    });
    if (deleted > 0) {
      await this.prisma.musicPlaylist.update({
        where: { id: playlistId },
        data: { trackCount: { decrement: deleted } },
      });
    }

    return {
      playlistId,
      trackId,
      containsTrack: false,
      trackCount: await this.count(playlistId),
    };
  }

  /**
   * Страница плейлиста.
   *
   * Кому открыт: владельцу, всем на подборку портала и всем на `public`.
   * Видимость `friends` **чужому не открывается**, и это не забывчивость:
   * граф доступа (`ActivityFollow`) принадлежит модулю `activity`, а контракт
   * сервисного модуля запрещает Музыке в него заглядывать. Проверить «этот
   * зритель — друг» здесь нечем, а открыть на всякий случай значит показать
   * то, что человек закрыл. Поэтому `friends` пока читает только владелец.
   *
   * 404, а не 403: иначе по коду ответа перебираются чужие плейлисты.
   */
  async getOne(
    viewerId: string,
    id: string,
  ): Promise<MusicPlaylistPageDto> {
    const row = await this.prisma.musicPlaylist.findUnique({
      where: { id },
      select: { ...PLAYLIST_SELECT, ownerId: true },
    });
    if (!row) throw new NotFoundException('Плейлист не найден');

    const isOwner = row.ownerId === viewerId;
    const open = isOwner || row.isSystem || row.visibility === 'public';
    if (!open) throw new NotFoundException('Плейлист не найден');

    const items = await this.prisma.musicPlaylistItem.findMany({
      where: { playlistId: id },
      orderBy: { position: 'asc' },
      take: MAX_ITEMS_PER_PLAYLIST,
      include: { track: { include: TRACK_CARD_INCLUDE } },
    });

    // Чужому показываем только опубликованное: в плейлисте владельца могут
    // лежать его собственные записи, ещё не прошедшие модерацию.
    const visible = items
      .map((item) => item.track)
      .filter((track) => isOwner || track.status === 'published');

    const totals = await this.totalsOf([id]);

    return {
      playlist: this.toDto(row, totals),
      tracks: visible.map((track) => toMusicTrackDto(track, this.publicBaseUrl)),
      canEdit: isOwner && !row.isSystem,
    };
  }

  /**
   * Перенос записи внутри плейлиста.
   *
   * Позиции разрежённые, поэтому обычный перенос — одна строка. Когда зазор
   * между соседями кончился, список перенумеровывается целиком и перенос
   * повторяется: это редкий случай, а не каждое перетаскивание.
   */
  async moveTrack(
    userId: string,
    playlistId: string,
    trackId: string,
    toIndex: number,
  ): Promise<{ ok: true }> {
    await this.own(userId, playlistId);

    const items = await this.prisma.musicPlaylistItem.findMany({
      where: { playlistId },
      orderBy: { position: 'asc' },
      select: { id: true, trackId: true, position: true },
    });

    const fromIndex = items.findIndex((item) => item.trackId === trackId);
    if (fromIndex < 0) throw new NotFoundException('Запись не в плейлисте');

    const positions = items.map((item) => item.position);
    let target = positionForMove(positions, fromIndex, toIndex);

    if (target === null) {
      // Зазор кончился: раздвигаем весь список и считаем заново.
      const fresh = renumber(items.length);
      await this.prisma.$transaction(
        items.map((item, index) =>
          this.prisma.musicPlaylistItem.update({
            where: { id: item.id },
            data: { position: fresh[index] },
          }),
        ),
      );
      target = positionForMove(fresh, fromIndex, toIndex);
    }

    if (target === null) {
      // После перенумерации зазор есть всегда — сюда попасть нечем, но
      // молча оставить запись на месте хуже, чем сказать об этом.
      throw new ForbiddenException('Не удалось переставить запись');
    }

    await this.prisma.musicPlaylistItem.update({
      where: { id: items[fromIndex].id },
      data: { position: target },
    });

    return { ok: true };
  }

  /** Свой и не подборка редакции. 404 вместо 403 на чужой — по той же причине. */
  private async own(userId: string, id: string): Promise<void> {
    const row = await this.prisma.musicPlaylist.findUnique({
      where: { id },
      select: { ownerId: true, isSystem: true },
    });
    if (!row || row.ownerId !== userId) {
      throw new NotFoundException('Плейлист не найден');
    }
    if (row.isSystem) {
      throw new ForbiddenException('Подборку портала правит только редакция');
    }
  }

  private async count(playlistId: string): Promise<number> {
    return this.prisma.musicPlaylistItem.count({ where: { playlistId } });
  }

  /**
   * Суммарная длительность по плейлистам. Одним запросом на все сразу:
   * подпись «14 записей · 58 мин» нужна в каждой строке списка, а N+1 на
   * экран настроек — самый дешёвый способ его уронить.
   */
  private async totalsOf(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();

    const rows = await this.prisma.musicPlaylistItem.findMany({
      where: { playlistId: { in: ids } },
      select: {
        playlistId: true,
        track: { select: { durationSeconds: true } },
      },
    });

    const totals = new Map<string, number>();
    for (const row of rows) {
      totals.set(
        row.playlistId,
        (totals.get(row.playlistId) ?? 0) + row.track.durationSeconds,
      );
    }
    return totals;
  }

  private toDto(
    row: {
      id: string;
      title: string;
      description: string | null;
      coverKey: string | null;
      visibility: MusicPlaylistDto['visibility'];
      trackCount: number;
      isSystem: boolean;
      updatedAt: Date;
    },
    totals: Map<string, number>,
  ): MusicPlaylistDto {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      coverUrl:
        row.coverKey && this.publicBaseUrl
          ? `${this.publicBaseUrl.replace(/\/$/, '')}/${row.coverKey}`
          : null,
      visibility: row.visibility,
      trackCount: row.trackCount,
      totalSeconds: totals.get(row.id) ?? 0,
      isSystem: row.isSystem,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
