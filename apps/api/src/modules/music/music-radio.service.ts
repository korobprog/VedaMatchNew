import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  MUSIC_RADIO_LISTENER_TTL_MS,
  resolveDisplayName,
  type MusicRadioInsertsDto,
  type MusicRadioItemDto,
  type MusicRadioStateDto,
} from '@vedamatch/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { catalogOnlyCondition } from './music-audiobook-scope';
import { musicCoverBaseUrl } from './music-cover-file';
import { MusicMetadataReader } from './music-metadata-reader';
import {
  insertExtension,
  normalizeInsertMime,
  pickRadioTrack,
  planRadioSlot,
  radioInsertStatus,
  radioWindow,
  resolveInsertDuration,
  resolveInsertTime,
  slotEndMs,
  validateRadioInsertFile,
} from './music-radio-schedule';
import { MusicStorageService } from './music-storage.service';
import { toMusicTrackDto } from './music-track-dto';

/** Ключ блокировки расписания: достраивает эфир один запрос за раз. */
const SCHEDULE_LOCK_KEY = 437_001;
/** На сколько вперёд достраивается эфир. */
const LOOKAHEAD_MS = 3 * 60_000;
/** Разрыв эфира, после которого он не продолжается встык, а начинается заново. */
const RESUME_GAP_MS = 60_000;
/** Предел слотов за один проход — страховка от цикла на коротких записях. */
const MAX_SLOTS_PER_PASS = 20;
/** Сколько хранится отзвучавший эфир вне текущего круга. */
const HISTORY_MS = 24 * 3_600_000;
/** Сколько вставок показывает редакции список. */
const INSERTS_LIMIT = 50;

/** Карточка записи — как у каталога (`TRACK_CARD_INCLUDE`). */
const TRACK_INCLUDE = {
  artist: true,
  album: { include: { artist: true } },
  categories: { include: { category: true } },
} as const;

type Tx = Prisma.TransactionClient;

export interface UploadedRadioFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * «Радио VM» (VED-437): общий эфир Медиатеки.
 *
 * Эфир — расписание слотов в базе, одно на всех, поэтому все слушатели
 * слышат одно и то же в одну и ту же секунду, а счётчик слушателей
 * означает ровно «сейчас с вами слушают». Расписание достраивается на
 * запросе на несколько минут вперёд под транзакционной блокировкой
 * Postgres — два слушателя, пришедшие одновременно, не построят два эфира.
 *
 * Записи — опубликованные записи каталога (без глав аудиокниг и лекций),
 * в случайном порядке без повторов, пока не прозвучат все. Голосовая
 * вставка редакции обрывает эфир в свою минуту: «сейчас» — сразу,
 * отложенная — в назначенное время.
 */
@Injectable()
export class MusicRadioService {
  private readonly logger = new Logger(MusicRadioService.name);
  private readonly publicBaseUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
    private readonly metadata: MusicMetadataReader,
    config: ConfigService,
  ) {
    this.publicBaseUrl = musicCoverBaseUrl(
      config.get<string>('API_PUBLIC_URL'),
    );
  }

  // ---------- Эфир ----------

  async state(now = new Date()): Promise<MusicRadioStateDto> {
    await this.ensureSchedule(now);
    const nowMs = now.getTime();
    const [slots, listeners] = await Promise.all([
      this.prisma.musicRadioSlot.findMany({
        where: { startsAt: { lte: new Date(nowMs + LOOKAHEAD_MS * 2) } },
        orderBy: { startsAt: 'desc' },
        take: MAX_SLOTS_PER_PASS * 2,
        include: {
          track: { include: TRACK_INCLUDE },
          insert: { select: { title: true, storageKey: true } },
        },
      }),
      this.countListeners(now),
    ]);
    const { current, next } = radioWindow(slots.reverse(), nowMs);
    return {
      serverTime: now.toISOString(),
      current: current ? await this.toItem(current) : null,
      next: next ? await this.toItem(next) : null,
      listeners,
    };
  }

  /** Плеер радио отметился: человек слушает. Ответ — свежий эфир. */
  async heartbeat(userId: string, now = new Date()) {
    await this.prisma.musicRadioListener.upsert({
      where: { userId },
      create: { userId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
    return this.state(now);
  }

  /** Радио выключили: из счётчика сразу, а не через минуту. */
  async leave(userId: string) {
    await this.prisma.musicRadioListener.deleteMany({ where: { userId } });
    return { ok: true };
  }

  private countListeners(now: Date): Promise<number> {
    return this.prisma.musicRadioListener.count({
      where: {
        lastSeenAt: {
          gt: new Date(now.getTime() - MUSIC_RADIO_LISTENER_TTL_MS),
        },
      },
    });
  }

  private async toItem(slot: {
    id: string;
    startsAt: Date;
    durationMs: number;
    track:
      (Parameters<typeof toMusicTrackDto>[0] & { storageKey: string }) | null;
    insert: { title: string; storageKey: string } | null;
  }): Promise<MusicRadioItemDto> {
    const key = slot.track?.storageKey ?? slot.insert?.storageKey ?? null;
    return {
      slotId: slot.id,
      kind: slot.track ? 'track' : 'insert',
      startsAt: slot.startsAt.toISOString(),
      durationMs: slot.durationMs,
      track: slot.track
        ? toMusicTrackDto(slot.track, this.publicBaseUrl)
        : null,
      insertTitle: slot.insert?.title ?? null,
      streamUrl: key ? await this.storage.presignGet(key) : null,
    };
  }

  /**
   * Достроить эфир до `now + LOOKAHEAD_MS`. Эфир, который никто не слушал,
   * не «доигрывается» задним числом: если последний слот кончился в
   * прошлом, новый начинается сейчас.
   */
  private async ensureSchedule(now: Date): Promise<void> {
    const nowMs = now.getTime();
    const last = await this.prisma.musicRadioSlot.findFirst({
      orderBy: { startsAt: 'desc' },
      select: { startsAt: true, durationMs: true },
    });
    if (last && slotEndMs(last) >= nowMs + LOOKAHEAD_MS) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SCHEDULE_LOCK_KEY})`;
      await this.extend(tx, nowMs);
    });
  }

  private async extend(tx: Tx, nowMs: number): Promise<void> {
    const last = await tx.musicRadioSlot.findFirst({
      orderBy: { startsAt: 'desc' },
      select: { startsAt: true, durationMs: true },
    });
    // Эфир продолжается встык, если прервался недавно (вставку «сейчас»
    // поставили, а следующий запрос пришёл через секунду); заброшенный
    // эфир начинается заново с текущего момента.
    const lastEnd = last ? slotEndMs(last) : null;
    let fromMs =
      lastEnd !== null && lastEnd >= nowMs - RESUME_GAP_MS ? lastEnd : nowMs;
    if (fromMs >= nowMs + LOOKAHEAD_MS) return;

    const lastTrack = await tx.musicRadioSlot.findFirst({
      where: { trackId: { not: null } },
      orderBy: { startsAt: 'desc' },
      select: { trackId: true, cycle: true },
    });
    let cycle = lastTrack?.cycle ?? 0;
    let lastTrackId = lastTrack?.trackId ?? null;

    const [pool, played] = await Promise.all([
      tx.musicTrack.findMany({
        where: { status: 'published', ...catalogOnlyCondition() },
        select: { id: true, durationSeconds: true },
      }),
      tx.musicRadioSlot.findMany({
        where: { cycle, trackId: { not: null } },
        select: { trackId: true },
      }),
    ]);
    const durations = new Map(
      pool.map((row) => [row.id, row.durationSeconds * 1000]),
    );
    const poolIds = pool.map((row) => row.id);
    const playedInCycle = new Set(
      played.map((row) => row.trackId).filter((id): id is string => !!id),
    );

    for (let pass = 0; pass < MAX_SLOTS_PER_PASS; pass += 1) {
      if (fromMs >= nowMs + LOOKAHEAD_MS) break;
      const insert = await tx.musicRadioInsert.findFirst({
        where: { slots: { none: {} } },
        orderBy: { scheduledAt: 'asc' },
        select: { id: true, scheduledAt: true, durationSeconds: true },
      });
      const picked = pickRadioTrack(poolIds, playedInCycle, lastTrackId, cycle);
      const plan = planRadioSlot(
        fromMs,
        insert
          ? {
              id: insert.id,
              atMs: insert.scheduledAt.getTime(),
              durationMs: insert.durationSeconds * 1000,
            }
          : null,
        picked
          ? {
              id: picked.trackId,
              cycle: picked.cycle,
              durationMs: durations.get(picked.trackId) ?? 0,
            }
          : null,
      );
      if (!plan) break;

      await tx.musicRadioSlot.create({
        data:
          plan.kind === 'insert'
            ? {
                startsAt: new Date(fromMs),
                durationMs: plan.durationMs,
                insertId: plan.insertId,
              }
            : {
                startsAt: new Date(fromMs),
                durationMs: plan.durationMs,
                trackId: plan.trackId,
                cycle: plan.cycle,
              },
      });
      if (plan.kind === 'track') {
        if (plan.cycle !== cycle) {
          cycle = plan.cycle;
          playedInCycle.clear();
        }
        playedInCycle.add(plan.trackId);
        lastTrackId = plan.trackId;
      }
      fromMs += plan.durationMs;
    }

    // Старый эфир: записи прошлых кругов старше суток. Записи текущего круга
    // хранятся, пока он не кончится, — по ним и считается «без повторов».
    // Слоты вставок не трогаем: вставка без слота снова встала бы в эфир.
    await tx.musicRadioSlot.deleteMany({
      where: {
        startsAt: { lt: new Date(nowMs - HISTORY_MS) },
        trackId: { not: null },
        cycle: { lt: cycle },
      },
    });
  }

  /**
   * Освободить эфир с момента `atMs`: слот, который в это время звучит,
   * обрывается, всё после — снимается и будет построено заново. Снятые
   * записи возвращаются в круг, снятые вставки — в очередь.
   */
  private async cutAt(tx: Tx, atMs: number): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SCHEDULE_LOCK_KEY})`;
    const at = new Date(atMs);
    await tx.musicRadioSlot.deleteMany({ where: { startsAt: { gte: at } } });
    const covering = await tx.musicRadioSlot.findFirst({
      where: { startsAt: { lt: at } },
      orderBy: { startsAt: 'desc' },
      select: { id: true, startsAt: true, durationMs: true },
    });
    if (covering && slotEndMs(covering) > atMs) {
      await tx.musicRadioSlot.update({
        where: { id: covering.id },
        data: { durationMs: atMs - covering.startsAt.getTime() },
      });
    }
  }

  // ---------- Вставки ----------

  private assertAdmin(viewerIsAdmin: boolean): void {
    if (!viewerIsAdmin) {
      throw new ForbiddenException('Доступ только для администратора сервиса');
    }
  }

  async inserts(
    viewerIsAdmin: boolean,
    now = new Date(),
  ): Promise<MusicRadioInsertsDto> {
    this.assertAdmin(viewerIsAdmin);
    const rows = await this.prisma.musicRadioInsert.findMany({
      orderBy: { scheduledAt: 'desc' },
      take: INSERTS_LIMIT,
      include: {
        slots: {
          orderBy: { startsAt: 'asc' },
          take: 1,
          select: { startsAt: true, durationMs: true },
        },
        createdBy: { select: { name: true, spiritualName: true } },
      },
    });
    const nowMs = now.getTime();
    return {
      inserts: rows.map((row) => ({
        id: row.id,
        title: row.title,
        durationSeconds: row.durationSeconds,
        // В эфире вставка могла выйти позже назначенного — пока звучала
        // предыдущая вставка; редакции честнее показать фактическое время.
        scheduledAt: (row.slots[0]?.startsAt ?? row.scheduledAt).toISOString(),
        status: radioInsertStatus(row.slots[0] ?? null, nowMs),
        createdAt: row.createdAt.toISOString(),
        createdByName: row.createdBy ? resolveDisplayName(row.createdBy) : null,
      })),
    };
  }

  async createInsert(
    viewerIsAdmin: boolean,
    userId: string,
    body: { title?: unknown; scheduledAt?: unknown; durationSeconds?: unknown },
    file: UploadedRadioFile | undefined,
    now = new Date(),
  ) {
    this.assertAdmin(viewerIsAdmin);
    if (!file) throw new BadRequestException('Нужен файл записи');
    const mime = normalizeInsertMime(file.mimetype);
    const fileError = validateRadioInsertFile({ mime, sizeBytes: file.size });
    if (fileError) throw new BadRequestException(fileError);

    const title =
      typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    const when = resolveInsertTime(body.scheduledAt, now);
    if ('error' in when) throw new BadRequestException(when.error);

    const parsed = await this.metadata.read(file.buffer, mime, file.size);
    const duration = resolveInsertDuration(
      parsed?.format?.duration ?? null,
      body.durationSeconds,
    );
    if (typeof duration === 'string') throw new BadRequestException(duration);

    const key = `radio/inserts/${randomUUID()}.${insertExtension(mime)}`;
    const stored = await this.storage.put(key, file.buffer, mime);
    if (!stored) throw new BadRequestException('Хранилище недоступно');

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.cutAt(tx, when.at.getTime());
        const row = await tx.musicRadioInsert.create({
          data: {
            title: title || 'Голосовая вставка',
            storageKey: key,
            mime,
            sizeBytes: file.size,
            durationSeconds: duration,
            scheduledAt: when.at,
            createdById: userId,
          },
          select: { id: true, scheduledAt: true },
        });
        return { id: row.id, scheduledAt: row.scheduledAt.toISOString() };
      });
    } catch (error) {
      await this.storage.remove(key).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Снять вставку. Отзвучавшая просто уходит из списка; назначенная или
   * звучащая — освобождает эфир с того места, где стояла бы.
   */
  async removeInsert(viewerIsAdmin: boolean, id: string, now = new Date()) {
    this.assertAdmin(viewerIsAdmin);
    const row = await this.prisma.musicRadioInsert.findUnique({
      where: { id },
      select: {
        storageKey: true,
        slots: { select: { startsAt: true, durationMs: true } },
      },
    });
    if (!row) throw new NotFoundException('Вставка не найдена');
    const nowMs = now.getTime();
    const live = row.slots.find((slot) => slotEndMs(slot) > nowMs);

    await this.prisma.$transaction(async (tx) => {
      if (live) {
        await this.cutAt(tx, Math.max(live.startsAt.getTime(), nowMs));
      }
      await tx.musicRadioInsert.delete({ where: { id } });
    });
    await this.storage.remove(row.storageKey).catch((error) => {
      this.logger.warn(`Файл вставки не удалился: ${String(error)}`);
    });
    return { ok: true };
  }
}
