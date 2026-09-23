import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMusicBookmarkRequest,
  MusicBookmarkDto,
  MusicBookmarksDto,
  UpdateMusicBookmarkRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MUSIC_BOOKMARKS_PER_TRACK_MAX,
  clampBookmarkPosition,
  normalizeBookmarkLabel,
} from './music-bookmark-input';

/**
 * Метки-закладки в записях (VED-388).
 *
 * Метка своя у каждого человека: чужие не видны и не правятся. На «не ваша»
 * и «нет такой» ответ один — 404, иначе по коду ответа можно перебирать
 * идентификаторы чужих меток.
 */

const BOOKMARK_SELECT = {
  id: true,
  trackId: true,
  positionSeconds: true,
  label: true,
  createdAt: true,
} as const;

function toDto(row: {
  id: string;
  trackId: string;
  positionSeconds: number;
  label: string | null;
  createdAt: Date;
}): MusicBookmarkDto {
  return {
    id: row.id,
    trackId: row.trackId,
    positionSeconds: row.positionSeconds,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class MusicBookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Запись, которую человеку можно слушать, — то же правило, что у плеера
   * (`MusicPlaybackService.playableTrack`), своей копией: у сервиса плеера
   * это внутренняя деталь, а не общий помощник.
   */
  private async playableTrack(userId: string, trackId: unknown) {
    if (typeof trackId !== 'string' || !trackId) {
      throw new NotFoundException('Запись не найдена');
    }
    const track = await this.prisma.musicTrack.findUnique({
      where: { id: trackId },
      select: {
        id: true,
        durationSeconds: true,
        status: true,
        uploadedById: true,
      },
    });
    const allowed =
      track && (track.status === 'published' || track.uploadedById === userId);
    if (!allowed) throw new NotFoundException('Запись не найдена');
    return track;
  }

  /** Метки записи по порядку в ней — так их и читают, сверху вниз по времени. */
  async list(userId: string, trackId: unknown): Promise<MusicBookmarksDto> {
    const track = await this.playableTrack(userId, trackId);
    const rows = await this.prisma.musicBookmark.findMany({
      where: { userId, trackId: track.id },
      orderBy: [{ positionSeconds: 'asc' }, { createdAt: 'asc' }],
      select: BOOKMARK_SELECT,
    });
    return { items: rows.map(toDto) };
  }

  async create(
    userId: string,
    body: CreateMusicBookmarkRequest,
  ): Promise<MusicBookmarkDto> {
    const track = await this.playableTrack(userId, body?.trackId);

    const position = clampBookmarkPosition(
      body.positionSeconds,
      track.durationSeconds,
    );
    if (position === null) {
      throw new BadRequestException('Не указано место в записи');
    }

    const count = await this.prisma.musicBookmark.count({
      where: { userId, trackId: track.id },
    });
    if (count >= MUSIC_BOOKMARKS_PER_TRACK_MAX) {
      throw new BadRequestException(
        `В одной записи — не больше ${MUSIC_BOOKMARKS_PER_TRACK_MAX} меток. Удалите лишние`,
      );
    }

    const row = await this.prisma.musicBookmark.create({
      data: {
        userId,
        trackId: track.id,
        positionSeconds: position,
        label: normalizeBookmarkLabel(body.label) ?? null,
      },
      select: BOOKMARK_SELECT,
    });
    return toDto(row);
  }

  /** Подпись меняется, место — нет: «передвинуть» метку — это поставить новую. */
  async update(
    userId: string,
    id: string,
    body: UpdateMusicBookmarkRequest,
  ): Promise<MusicBookmarkDto> {
    const label = normalizeBookmarkLabel(body?.label);
    if (label === undefined) {
      throw new BadRequestException('Нечего менять: пришлите подпись');
    }
    // Клейм по владельцу: `updateMany` с `userId` в условии не тронет чужую
    // метку, даже если идентификатор угадан.
    const { count } = await this.prisma.musicBookmark.updateMany({
      where: { id, userId },
      data: { label },
    });
    if (count === 0) throw new NotFoundException('Метка не найдена');

    const row = await this.prisma.musicBookmark.findUnique({
      where: { id },
      select: BOOKMARK_SELECT,
    });
    if (!row) throw new NotFoundException('Метка не найдена');
    return toDto(row);
  }

  /** Идемпотентно: второе нажатие «удалить» не должно выглядеть ошибкой. */
  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.musicBookmark.deleteMany({ where: { id, userId } });
    return { ok: true };
  }
}
