import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MusicTrackDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { toMusicTrackDto } from './music-track-dto';

/**
 * Избранное.
 *
 * Вынесено вперёд из этапа 4: сердце есть в макете полосы плеера, а модель
 * `MusicFavorite` уже в схеме и стоит двух эндпоинтов. Плейлисты, в отличие
 * от него, тянут за собой порядок, видимость и отдельные страницы — они
 * остаются на своём этапе.
 *
 * Обе команды идемпотентны: сердце нажимают дважды, и ошибка в ответ на это
 * — худшее, что может сделать интерфейс.
 */
@Injectable()
export class MusicFavoritesService {
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.publicBaseUrl = config.get<string>('S3_PUBLIC_URL') || undefined;
  }

  async add(userId: string, trackId: string): Promise<{ favorited: true }> {
    const track = await this.prisma.musicTrack.findUnique({
      where: { id: trackId },
      select: { id: true, status: true, uploadedById: true },
    });

    // 404 и на «нет записи», и на «не для вас»: иначе по коду ответа
    // перебираются чужие черновики.
    const allowed =
      track && (track.status === 'published' || track.uploadedById === userId);
    if (!allowed) throw new NotFoundException('Запись не найдена');

    await this.prisma.musicFavorite.upsert({
      where: { userId_trackId: { userId, trackId } },
      create: { userId, trackId },
      update: {},
    });

    return { favorited: true };
  }

  /**
   * Снятие записи не проверяет: её могли уже удалить из каталога, а сердце
   * у человека осталось нажатым. Требовать существующую запись значит не
   * дать ему прибраться у себя.
   */
  async remove(userId: string, trackId: string): Promise<{ favorited: false }> {
    await this.prisma.musicFavorite.deleteMany({
      where: { userId, trackId },
    });
    return { favorited: false };
  }

  /**
   * Своё избранное. Снятые с витрины записи не показываются: сердце
   * остаётся нажатым, но отдавать скрытую по жалобе запись через избранное
   * в обход каталога нельзя.
   */
  async list(userId: string): Promise<{ items: MusicTrackDto[] }> {
    const rows = await this.prisma.musicFavorite.findMany({
      where: { userId, track: { status: 'published' } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        track: {
          include: {
            artist: true,
            album: { include: { artist: true } },
            categories: { include: { category: true } },
          },
        },
      },
    });

    return {
      items: rows.map((row) => toMusicTrackDto(row.track, this.publicBaseUrl)),
    };
  }

  /** Что из показанного человек уже отметил — для сердец в списке. */
  async markedOf(userId: string, trackIds: string[]): Promise<string[]> {
    if (trackIds.length === 0) return [];

    const rows = await this.prisma.musicFavorite.findMany({
      where: { userId, trackId: { in: trackIds } },
      select: { trackId: true },
    });
    return rows.map((row) => row.trackId);
  }
}
