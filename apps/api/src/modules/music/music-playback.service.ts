import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PORTAL_NOW_PLAYING_EVENT,
  type ActivityNowPlayingDto,
  type MusicListenStatsDto,
  type MusicPlaybackStateDto,
  type MusicHeartbeatRequest,
  type MusicSettingsDto,
  type PortalNowPlayingEvent,
  type UpdateMusicPlaybackStateRequest,
  type UpdateMusicSettingsRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { mayShareMusicActivity } from './music-activity-share';
import { isNowPlayingStale } from './now-playing-visibility';

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

/** Окно недельной сводки. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Ретеншен истории. Девяносто дней — срок из «Модели данных» плана сервиса.
 * Без чистки `MusicListen` растёт быстрее всех остальных таблиц портала: по
 * строке на каждое прослушивание каждого человека, навсегда.
 */
const LISTEN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Сколько строк истории уносим за тик. Ограничение есть, потому что первый
 * обход после включения ретеншена пойдёт по всему хвосту сразу, а держать
 * долгую транзакцию на самой быстрорастущей таблице незачем: остальное
 * доберёт следующий тик через десять минут.
 */
const LISTEN_PURGE_BATCH = 1000;

/** Сколько строк «слушает сейчас» осматриваем за тик. */
const NOW_PLAYING_SWEEP_BATCH = 200;

const DEFAULT_SETTINGS: MusicSettingsDto = {
  nowPlayingVisibility: 'friends',
  autoplay: true,
};

@Injectable()
export class MusicPlaybackService {
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventEmitter2,
    config: ConfigService,
  ) {
    this.publicBaseUrl = config.get<string>('S3_PUBLIC_URL') || undefined;
  }

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
        title: true,
        coverKey: true,
        durationSeconds: true,
        status: true,
        uploadedById: true,
        artist: { select: { name: true } },
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

    // Что было до тика: событие «слушает» уходит только на смену записи или
    // на вход-выход из невидимого сеанса. Тик приходит раз в 30 секунд, и
    // рассылать одно и то же полсотни раз за киртан незачем.
    const before = await this.prisma.musicNowPlaying.findUnique({
      where: { userId },
      select: { trackId: true, isPrivateSession: true },
    });

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

    const isPrivate = Boolean(body.isPrivateSession);
    const changed =
      before?.trackId !== track.id || before.isPrivateSession !== isPrivate;
    if (changed) {
      await this.announceNowPlaying(
        userId,
        isPrivate
          ? null
          : {
              trackId: track.id,
              title: track.title,
              artistName: track.artist?.name ?? null,
              coverUrl:
                track.coverKey && this.publicBaseUrl
                  ? `${this.publicBaseUrl.replace(/\/$/, '')}/${track.coverKey}`
                  : null,
              link: `/music/tracks/${track.id}`,
              addLink: `/music/tracks/${track.id}?add=1`,
            },
      );
    }

    return { ok: true as const, positionSeconds: position };
  }

  /**
   * Эфемерный факт «слушает сейчас» для ленты друзей.
   *
   * Не пишется никуда: рассылку по графу доступа делает модуль `activity`,
   * которому этот граф и принадлежит. Своя копия графа здесь разъехалась бы
   * с оригиналом на первом же отзыве доступа.
   *
   * `null` — перестал слушать или ушёл в невидимый сеанс: строка у друзей
   * должна погаснуть, а не залипнуть на последней записи.
   */
  private async announceNowPlaying(
    userId: string,
    nowPlaying: ActivityNowPlayingDto | null,
  ): Promise<void> {
    if (nowPlaying) {
      const settings = await this.prisma.musicSettings.findUnique({
        where: { userId },
        select: { nowPlayingVisibility: true },
      });
      if (!mayShareMusicActivity(settings?.nowPlayingVisibility)) return;
    }

    const event: PortalNowPlayingEvent = {
      name: PORTAL_NOW_PLAYING_EVENT,
      userId,
      occurredAt: new Date().toISOString(),
      nowPlaying,
    };
    this.bus.emit(event.name, event);
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

    // Заведение строки — единственное место, где растёт `playCount`: одно
    // прослушивание даёт одно очко. Инкремент на каждом тике превратил бы
    // счётчик в секундомер, а сортировку «популярное» — в «самое длинное».
    // Транзакцией, чтобы счётчик и история не разъезжались.
    await this.prisma.$transaction([
      this.prisma.musicListen.create({ data: { userId, trackId, seconds } }),
      this.prisma.musicTrack.update({
        where: { id: trackId },
        data: { playCount: { increment: 1 } },
      }),
    ]);
  }

  /**
   * Человек остановил воспроизведение. Строку «слушает сейчас» снимаем
   * сразу, не дожидаясь протухания: пауза — это уже «не слушает».
   */
  async stop(userId: string) {
    const { count } = await this.prisma.musicNowPlaying.deleteMany({
      where: { userId },
    });
    // Гасим строку у друзей только если было чему гаснуть: плеер зовёт
    // `stop` и на закрытии вкладки, где ничего не играло.
    if (count > 0) await this.announceNowPlaying(userId, null);
    return { ok: true as const };
  }

  /**
   * Снять протухшие строки «слушает сейчас».
   *
   * Плеер зовёт `stop` на `pagehide`, но убитая вкладка, разряженный телефон
   * и упавший браузер этого события не дают. Без обхода человек «слушает»
   * третьи сутки: строка висит, а лента друзей повторяет её как правду.
   *
   * Порог — общий с проверкой видимости (`isNowPlayingStale`), чтобы «уже не
   * показываем» и «уже сняли» не разъехались на две разные величины.
   */
  async sweepStaleNowPlaying(now = new Date()): Promise<number> {
    // Самые давние сверху: протухшие — именно там, и обходить всю таблицу
    // ради десятка строк незачем.
    const rows = await this.prisma.musicNowPlaying.findMany({
      orderBy: { updatedAt: 'asc' },
      take: NOW_PLAYING_SWEEP_BATCH,
      select: {
        userId: true,
        updatedAt: true,
        track: { select: { durationSeconds: true } },
      },
    });

    let swept = 0;
    for (const row of rows) {
      const stale = isNowPlayingStale(
        {
          updatedAt: row.updatedAt,
          durationSeconds: row.track.durationSeconds,
        },
        now,
      );
      if (!stale) continue;

      // Клейм по `updatedAt`: между выборкой и удалением мог прийти тик —
      // человек снова слушает, и гасить строку у друзей нечего. Он же
      // защищает от второго процесса, который шлёт то же событие.
      const { count } = await this.prisma.musicNowPlaying.deleteMany({
        where: { userId: row.userId, updatedAt: row.updatedAt },
      });
      if (count === 0) continue;

      await this.announceNowPlaying(row.userId, null);
      swept += 1;
    }

    return swept;
  }

  /**
   * Ретеншен истории. Отбираем идентификаторы пачкой и удаляем по ним:
   * `deleteMany` по условию снёс бы весь хвост одной транзакцией, а первый
   * обход после включения ретеншена пойдёт как раз по всему хвосту.
   */
  async purgeOldListens(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - LISTEN_RETENTION_MS);
    const stale = await this.prisma.musicListen.findMany({
      where: { listenedAt: { lt: cutoff } },
      select: { id: true },
      take: LISTEN_PURGE_BATCH,
    });
    if (stale.length === 0) return 0;

    const { count } = await this.prisma.musicListen.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
    return count;
  }

  /**
   * Наслушано за неделю. Считаем по истории, а не отдельным счётчиком:
   * история и так пишется, а счётчик пришлось бы пересчитывать каждый раз,
   * когда ретеншен подрезает хвост.
   */
  async getStats(userId: string): Promise<MusicListenStatsDto> {
    const since = new Date(Date.now() - WEEK_MS);
    const sum = await this.prisma.musicListen.aggregate({
      where: { userId, listenedAt: { gte: since } },
      _sum: { seconds: true },
    });

    return { weekSeconds: sum._sum.seconds ?? 0 };
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
