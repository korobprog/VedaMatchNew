import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  MusicPlaybackStateDto,
  MusicHeartbeatRequest,
  MusicSettingsDto,
  UpdateMusicPlaybackStateRequest,
  UpdateMusicSettingsRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Состояние плеера, тик воспроизведения и настройки прослушивания.
 *
 * Три вещи в одном сервисе, потому что все три обслуживают один тик плеера:
 * позиция, «слушает сейчас» и история пишутся из одного запроса, и разносить
 * их по сервисам значит делать три круга в базу вместо одного.
 */

/**
 * С какой секунды прослушивание попадает в историю.
 *
 * Тридцать секунд — граница между «ткнул и закрыл» и «слушал». Без неё
 * `MusicListen` растёт быстрее всех остальных таблиц портала вместе взятых:
 * каждое пролистывание каталога оставляло бы строку.
 */
const LISTEN_THRESHOLD_SECONDS = 30;

/**
 * Окно, в котором тики считаются одним прослушиванием. Больше длительности
 * самой длинной записи быть не должно, иначе вчерашнее прослушивание той же
 * лекции дописывалось бы в сегодняшнюю строку.
 */
const LISTEN_WINDOW_MS = 6 * 60 * 60 * 1000;

const DEFAULT_SETTINGS: MusicSettingsDto = {
  nowPlayingVisibility: 'friends',
  autoplay: true,
};

@Injectable()
export class MusicPlaybackService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Запись, которую человеку разрешено слушать. Неопубликованную слышит
   * только тот, кто её загрузил, — до разбора модератором.
   *
   * 404 и на «нет записи», и на «не для вас»: иначе по коду ответа можно
   * перебрать, какие чужие черновики существуют.
   */
  private async playableTrack(userId: string, trackId: string) {
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

  /**
   * Тик плеера. Раз в 30 секунд, пока играет.
   *
   * Три записи за один запрос: позиция для возобновления, строка «слушает
   * сейчас» для друзей и история. Порядок не важен — они независимы.
   */
  async heartbeat(userId: string, body: MusicHeartbeatRequest) {
    const track = await this.playableTrack(userId, body.trackId);

    // Клиенту верить нельзя: позиция приходит из `<audio>`, но дойти сюда
    // может что угодно, а отрицательная позиция ломает возобновление.
    const position = Math.min(
      Math.max(0, Math.floor(body.positionSeconds || 0)),
      track.durationSeconds,
    );

    await Promise.all([
      this.prisma.musicPlayState.upsert({
        where: { userId_trackId: { userId, trackId: track.id } },
        create: { userId, trackId: track.id, positionSeconds: position },
        update: { positionSeconds: position },
      }),
      this.prisma.musicNowPlaying.upsert({
        where: { userId },
        create: {
          userId,
          trackId: track.id,
          isPrivateSession: Boolean(body.isPrivateSession),
        },
        update: {
          trackId: track.id,
          isPrivateSession: Boolean(body.isPrivateSession),
        },
      }),
      this.recordListen(userId, track.id, body.listenedSeconds),
    ]);

    return { ok: true as const, positionSeconds: position };
  }

  /**
   * История. Одна строка на прослушивание: заводится, когда накопилось
   * достаточно, дальше растёт. Строка на каждый тик превратила бы таблицу в
   * журнал сердцебиения.
   */
  private async recordListen(
    userId: string,
    trackId: string,
    listenedSeconds: number,
  ): Promise<void> {
    const seconds = Math.max(0, Math.floor(listenedSeconds || 0));
    if (seconds < LISTEN_THRESHOLD_SECONDS) return;

    const since = new Date(Date.now() - LISTEN_WINDOW_MS);
    const existing = await this.prisma.musicListen.findFirst({
      where: { userId, trackId, listenedAt: { gte: since } },
      orderBy: { listenedAt: 'desc' },
      select: { id: true, seconds: true },
    });

    if (existing) {
      await this.prisma.musicListen.update({
        where: { id: existing.id },
        data: { seconds: existing.seconds + seconds },
      });
      return;
    }

    await this.prisma.musicListen.create({
      data: { userId, trackId, seconds },
    });
  }

  /**
   * Человек остановил воспроизведение. Строку «слушает сейчас» снимаем
   * сразу, не дожидаясь протухания: пауза — это уже «не слушает».
   */
  async stop(userId: string) {
    await this.prisma.musicNowPlaying.deleteMany({ where: { userId } });
    return { ok: true as const };
  }

  /**
   * Состояние для возобновления. Берём последнюю тронутую позицию: очередь и
   * режимы плеер держит у себя и присылает сам — серверу они нужны только
   * чтобы отдать их другому устройству.
   */
  async getState(userId: string): Promise<MusicPlaybackStateDto> {
    const last = await this.prisma.musicPlayState.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { trackId: true, positionSeconds: true, updatedAt: true },
    });

    if (!last) {
      return {
        trackId: null,
        positionSeconds: 0,
        queue: [],
        repeat: 'off',
        shuffle: false,
        updatedAt: null,
      };
    }

    return {
      trackId: last.trackId,
      positionSeconds: last.positionSeconds,
      // Очередь пока не хранится на сервере: до этапа 4 она короткая и
      // целиком помещается в localStorage. Поле в ответе есть, чтобы плеер
      // не переписывать, когда хранение появится.
      queue: [],
      repeat: 'off',
      shuffle: false,
      updatedAt: last.updatedAt.toISOString(),
    };
  }

  /** Плеер сохраняет позицию при паузе и при уходе со страницы. */
  async putState(userId: string, body: UpdateMusicPlaybackStateRequest) {
    if (!body.trackId) return this.getState(userId);

    const track = await this.playableTrack(userId, body.trackId);
    const position = Math.min(
      Math.max(0, Math.floor(body.positionSeconds || 0)),
      track.durationSeconds,
    );

    await this.prisma.musicPlayState.upsert({
      where: { userId_trackId: { userId, trackId: track.id } },
      create: { userId, trackId: track.id, positionSeconds: position },
      update: { positionSeconds: position },
    });

    return this.getState(userId);
  }

  /**
   * Настройки. Строки может не быть — это норма, а не сбой: человек ничего
   * не менял. Отдаём значения по умолчанию, чтобы клиент не разбирался.
   */
  async getSettings(userId: string): Promise<MusicSettingsDto> {
    const row = await this.prisma.musicSettings.findUnique({
      where: { userId },
      select: { nowPlayingVisibility: true, autoplay: true },
    });

    return row ?? DEFAULT_SETTINGS;
  }

  async updateSettings(
    userId: string,
    body: UpdateMusicSettingsRequest,
  ): Promise<MusicSettingsDto> {
    const patch = {
      ...(body.nowPlayingVisibility === undefined
        ? {}
        : { nowPlayingVisibility: body.nowPlayingVisibility }),
      ...(body.autoplay === undefined ? {} : { autoplay: body.autoplay }),
    };

    const row = await this.prisma.musicSettings.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_SETTINGS, ...patch },
      update: patch,
      select: { nowPlayingVisibility: true, autoplay: true },
    });

    return row;
  }
}
