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
  resolveDisplayName,
  type MusicFriendPlaylistDto,
  type MusicPlaylistDto,
  type MusicPlaylistPageDto,
  type MusicPlaylistPickDto,
  type MusicPlaylistTrackResultDto,
  type PortalActivityEvent,
  type UpdateMusicPlaylistRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalAccessService } from '../access/access.service';
import { MusicCoversService } from './music-covers.service';
import { mayShareMusicActivity } from './music-activity-share';
import { toMusicTrackDto } from './music-track-dto';
import {
  POSITION_STEP, nextPosition, positionForMove, renumber } from './playlist-order';

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
    private readonly access: PortalAccessService,
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
   * Плейлисты тех, кто открыл мне доступ. См. docs/music-service-plan.md.
   *
   * Граф спрашивается у портального `PortalAccessService` — своей копии у
   * Музыки нет и быть не должно: она разъехалась бы с оригиналом на первом
   * же отзыве доступа.
   *
   * Видимость `public` тоже берём: плейлист, открытый всем, друг увидеть
   * вправе тем более. Личные (`private`) не показываются никому, кроме
   * владельца, а подборки редакции живут на витрине и в этот список не идут —
   * иначе они забили бы его собой у каждого.
   */
  async listFriendPlaylists(
    viewerId: string,
  ): Promise<{ items: MusicFriendPlaylistDto[] }> {
    const granters = await this.access.grantersFor(viewerId);
    const ownerIds = Array.from(new Set(granters.map((row) => row.granterId)));
    if (ownerIds.length === 0) return { items: [] };

    const rows = await this.prisma.musicPlaylist.findMany({
      where: {
        ownerId: { in: ownerIds },
        isSystem: false,
        visibility: { in: ['friends', 'public'] },
        // Пустой плейлист в чужом списке — это строка, по которой нечего
        // слушать: показывать её значит звать в никуда.
        trackCount: { gt: 0 },
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_PLAYLISTS_PER_USER,
      select: {
        ...PLAYLIST_SELECT,
        owner: {
          select: {
            id: true,
            name: true,
            spiritualName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Владелец у плейлиста необязателен: связь `SetNull`, чтобы уход
    // администратора не унёс подборку. Плейлист без владельца в списке «у
    // друзей» показывать не от кого — пропускаем.
    const owned = rows.filter(
      (row): row is typeof row & { owner: NonNullable<typeof row.owner> } =>
        row.owner !== null,
    );

    const totals = await this.totalsOf(owned.map((row) => row.id));
    return {
      items: owned.map((row) => ({
        ...this.toDto(row, totals),
        owner: {
          id: row.owner.id,
          name: resolveDisplayName(row.owner),
          avatarUrl: row.owner.avatarUrl,
        },
      })),
    };
  }

  /**
   * Забрать чужой плейлист себе копией.
   *
   * Копия, а не подписка: смысл разный. Копия — «возьму и переделаю под
   * своё», и она сразу отвязана от оригинала; подписка была бы про «хочу
   * быть в курсе» и требует своей таблицы. Одно другому не мешает.
   *
   * Забираем и записи, и порядок. Название с пометкой, чей он: через неделю
   * три «Утренних киртана» в списке не различить.
   */
  async copyToSelf(
    viewerId: string,
    playlistId: string,
  ): Promise<MusicPlaylistDto> {
    const source = await this.prisma.musicPlaylist.findUnique({
      where: { id: playlistId },
      select: {
        id: true,
        title: true,
        description: true,
        visibility: true,
        isSystem: true,
        ownerId: true,
        owner: { select: { name: true, spiritualName: true } },
      },
    });

    // 404 и на «нет», и на «не для вас» — как везде в сервисе.
    const visible =
      source &&
      (source.ownerId === viewerId ||
        source.isSystem ||
        source.visibility === 'public' ||
        (source.visibility === 'friends' &&
          source.ownerId !== null &&
          (await this.access.canSeeActivity(viewerId, source.ownerId))));
    if (!source || !visible) throw new NotFoundException('Плейлист не найден');

    const count = await this.prisma.musicPlaylist.count({
      where: { ownerId: viewerId },
    });
    if (count >= MAX_PLAYLISTS_PER_USER) {
      throw new ForbiddenException(
        `Больше ${MAX_PLAYLISTS_PER_USER} плейлистов — это уже не список`,
      );
    }

    const items = await this.prisma.musicPlaylistItem.findMany({
      where: { playlistId },
      orderBy: { position: 'asc' },
      select: { trackId: true },
    });

    // Подборка редакции и своя копия обходятся без «от кого».
    const from =
      source.ownerId === viewerId || !source.owner
        ? null
        : resolveDisplayName(source.owner);
    const created = await this.prisma.musicPlaylist.create({
      data: {
        ownerId: viewerId,
        title: from
          ? `${source.title} — от ${from}`.slice(0, 120)
          : `${source.title} — копия`.slice(0, 120),
        description: source.description,
        // Копия всегда личная: чужой плейлист, ставший у меня открытым,
        // разошёлся бы по кругу без ведома того, кто его собрал.
        visibility: 'private',
        trackCount: items.length,
        items: {
          create: items.map((item, index) => ({
            trackId: item.trackId,
            position: (index + 1) * POSITION_STEP,
          })),
        },
      },
      select: PLAYLIST_SELECT,
    });

    return this.toDto(created, await this.totalsOf([created.id]));
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
      await this.announcePublished(userId, row.id, row.title);
    }

    const totals = await this.totalsOf([id]);
    return this.toDto(row, totals);
  }

  /**
   * Факт для ленты друзей: человек открыл свой плейлист. Событие
   * самодостаточно — подписчик не имеет права дочитывать название из таблиц
   * Музыки.
   *
   * Ссылка ставится всегда: карточку ленты получают ровно те, кому владелец
   * открыл активность, а страница плейлиста «для друзей» спрашивает о том же
   * у портального графа доступа. Раньше ссылки у `friends` не было — граф
   * лежал внутри `activity`, и проверить было нечем.
   */
  private async announcePublished(
    userId: string,
    playlistId: string,
    title: string,
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
      link: `/music/playlists/${playlistId}`,
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
   * Кому открыт: владельцу, всем на подборку портала, всем на `public` и
   * тем, кому владелец открыл активность, — на `friends`. Последнее
   * спрашивается у `PortalAccessService`: граф доступа портальный, своей
   * копии здесь нет и быть не должно — она разъехалась бы с оригиналом на
   * первом же отзыве доступа.
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
    const open =
      isOwner ||
      row.isSystem ||
      row.visibility === 'public' ||
      (row.visibility === 'friends' &&
        row.ownerId !== null &&
        (await this.access.canSeeActivity(viewerId, row.ownerId)));
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
