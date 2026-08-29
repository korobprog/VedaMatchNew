import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PORTAL_ACTIVITY_EVENTS,
  type MusicTrackDto,
  type PortalActivityEvent,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { mayShareMusicActivity } from './music-activity-share';
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

/**
 * Потолок выдачи избранного. Одной константой на список записей и на список
 * идентификаторов: разойдутся — и сердца на карточках перестанут совпадать с
 * содержимым страницы «Избранное» ровно на двухсотой записи.
 */
const MAX_FAVORITES = 200;

@Injectable()
export class MusicFavoritesService {
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventEmitter2,
    config: ConfigService,
  ) {
    this.publicBaseUrl = config.get<string>('S3_PUBLIC_URL') || undefined;
  }

  async add(userId: string, trackId: string): Promise<{ favorited: true }> {
    const track = await this.prisma.musicTrack.findUnique({
      where: { id: trackId },
      select: { id: true, title: true, status: true, uploadedById: true },
    });

    // 404 и на «нет записи», и на «не для вас»: иначе по коду ответа
    // перебираются чужие черновики.
    const allowed =
      track && (track.status === 'published' || track.uploadedById === userId);
    if (!allowed) throw new NotFoundException('Запись не найдена');

    const before = await this.prisma.musicFavorite.findUnique({
      where: { userId_trackId: { userId, trackId } },
      select: { trackId: true },
    });

    await this.prisma.musicFavorite.upsert({
      where: { userId_trackId: { userId, trackId } },
      create: { userId, trackId },
      update: {},
    });

    // Только на первое нажатие: сердце жмут дважды, и второй раз — это не
    // новое событие, а исправление промаха. Лента не должна показывать его
    // друзьям как ещё одно действие.
    if (!before) await this.announceFavorite(userId, track.id, track.title);

    return { favorited: true };
  }

  /**
   * Факт для ленты друзей. Событие самодостаточно, как требует контракт:
   * подписчик не имеет права дочитывать название из таблиц Музыки.
   *
   * Молчит, когда человек выключил видимость: настройка одна на всё, что
   * Музыка сообщает наружу, — см. `music-activity-share.ts`.
   */
  private async announceFavorite(
    userId: string,
    trackId: string,
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
      action: 'music.track-favorited',
      occurredAt: new Date().toISOString(),
      entityId: trackId,
      entityLabel: title,
      link: `/music/tracks/${trackId}`,
    };
    this.bus.emit(event.name, event);
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
      take: MAX_FAVORITES,
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

  /**
   * Все отмеченные — для сердец в списках.
   *
   * Целиком, а не по показанным: список короткий (потолок избранного — двести
   * записей), и один запрос на открытие страницы дешевле запроса на каждую
   * прокрутку каталога.
   */
  async listIds(userId: string): Promise<{ ids: string[] }> {
    const rows = await this.prisma.musicFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_FAVORITES,
      select: { trackId: true },
    });

    return { ids: rows.map((row) => row.trackId) };
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
